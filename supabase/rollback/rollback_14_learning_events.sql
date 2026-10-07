-- Откат M14: возвращает тренинги к модели Phase 3A. Статусы DRAFT/APPROVED/REGISTERED превращаются в PLANNED
-- (прежний тип enum не умеет их хранить); типы мероприятий и провайдеры удаляются.
drop trigger if exists trainings_status_guard on trainings;
drop trigger if exists trainings_default_type on trainings;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array['create_training','update_training','upsert_event_type','upsert_provider','trg_training_default_type','trg_training_status_guard','training_transition_allowed','kpi_year']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
drop view if exists v_training_list;
update trainings set status = 'PLANNED' where status::text in ('DRAFT','APPROVED','REGISTERED');
alter table trainings drop column if exists event_type_id, drop column if exists provider_id, drop column if exists organizer, drop column if exists result_summary;
alter table training_participants drop column if exists result, drop column if exists result_note;
drop table if exists learning_providers, learning_event_types cascade;
alter type training_status rename to training_status_old;
create type training_status as enum ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED','POSTPONED','NOT_HELD');
alter table trainings alter column status type training_status using status::text::training_status;
drop type training_status_old;
create view v_training_list with (security_invoker = true) as
select t.id, t.canonical_id, t.title, t.format, t.kind, t.status, t.source_type, t.source_confirmed, t.hours,
       t.start_date, t.end_date, t.location, t.request_id, t.archived_at, t.participants_planned,
       participants_count(t.id) as participants,
       man_hours(t.id) as man_hours,
       actual_total(t.id) as actual_tjs,
       has_attendance(t.id) as attendance_mode
  from trainings t;

revoke all on v_training_list from anon;
grant select on v_training_list to authenticated;
create function kpi_year(p_year smallint) returns table(
  financial_access financial_access,
  plan_status text,
  plan_usd numeric,
  plan_tjs numeric,
  financial_actual_tjs numeric,
  variance_tjs numeric,
  delivered_count integer,
  delivered_unique_participants integer,
  delivered_man_hours numeric,
  in_progress_count integer,
  unplanned_delivered_count integer,
  unplanned_delivered_pct numeric,
  unplanned_unconfirmed_count integer,
  unplanned_financial_actual_tjs numeric)
language sql stable set search_path = public, pg_temp as $$
  with ver as (
    select approved_version(p_year) as v,
           has_financial_access() as ok,
           (select value::numeric from app_settings where key = 'budget_fx_usd_tjs') as fx),
  tr as (select * from trainings where archived_at is null and extract(year from start_date) = p_year),
  dl as (select * from tr where status = 'COMPLETED'),
  fa as (select sum(amount_tjs) as s from expense_operations
         where voided_at is null and extract(year from operation_date) = p_year),
  ea as (select sum(x.amount_tjs) as s
         from expense_operations x join trainings t on t.id = x.training_id
         where x.voided_at is null and t.source_type = 'UNPLANNED'
           and extract(year from x.operation_date) = p_year)
  select
    financial_access_state(),
    case when not ver.ok then null
         when ver.v is null then 'NO_APPROVED_VERSION'
         when ver.fx is null then 'NO_FX'
         else 'OK' end,
    case when ver.ok and ver.v is not null then planned_total_usd(ver.v) end,
    case when ver.ok and ver.v is not null and ver.fx is not null then planned_total_tjs(ver.v) end,
    case when ver.ok then coalesce(fa.s, 0) end,
    case when ver.ok and ver.v is not null and ver.fx is not null
         then round(coalesce(fa.s, 0) - planned_total_tjs(ver.v), 2) end,
    (select count(*)::int from dl),
    (select count(distinct p.employee_id)::int
       from training_participants p join dl on dl.id = p.training_id where p.attended),
    (select coalesce(sum(man_hours(dl.id)), 0) from dl),
    (select count(*)::int from tr where status = 'IN_PROGRESS'),
    (select count(*)::int from dl where source_type = 'UNPLANNED'),
    round((select count(*) from dl where source_type = 'UNPLANNED')::numeric
          / nullif((select count(*) from dl), 0) * 100, 2),
    (select count(*)::int from dl where source_type = 'UNPLANNED' and not source_confirmed),
    case when ver.ok then coalesce(ea.s, 0) end
  from ver, fa, ea
$$;;

create function create_training(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_title text := trim(coalesce(p->>'title', ''));
        v_start date := nullif(p->>'start_date','')::date;
        v_end date; v_hours numeric := nullif(p->>'hours','')::numeric;
        v_req uuid := nullif(p->>'request_id','')::uuid; v_src source_type;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  if v_title = '' then raise exception 'Укажите название тренинга' using errcode = 'P0015'; end if;
  if v_start is null then raise exception 'Укажите дату начала' using errcode = 'P0015'; end if;
  v_end := coalesce(nullif(p->>'end_date','')::date, v_start);
  if v_end < v_start then raise exception 'Дата окончания раньше даты начала' using errcode = 'P0015'; end if;
  if v_hours is null or v_hours <= 0 then raise exception 'Укажите длительность в часах (больше 0)' using errcode = 'P0015'; end if;
  if v_req is not null and not exists (select 1 from training_requests where id = v_req and archived_at is null) then
    raise exception 'Заявка не найдена или в архиве' using errcode = 'P0015';
  end if;
  v_src := case when v_req is null then 'UNPLANNED' else 'PLANNED' end;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создание тренинга'), true);
  insert into trainings(canonical_id, title, format, kind, location, hours, start_date, end_date, status,
                        source_type, source_confirmed, request_id, unplanned_reason, comment, description, participants_planned)
  values (next_training_code(extract(year from v_start)::int), v_title,
          coalesce(nullif(p->>'format','')::training_format, 'OFFLINE'),
          coalesce(nullif(p->>'kind','')::training_kind, 'UNSPECIFIED'),
          nullif(trim(coalesce(p->>'location','')), ''), v_hours, v_start, v_end,
          coalesce(nullif(p->>'status','')::training_status, 'PLANNED'),
          v_src, true, v_req,
          case when v_src = 'UNPLANNED' then nullif(p->>'unplanned_reason','')::unplanned_reason end,
          nullif(trim(coalesce(p->>'comment','')), ''), nullif(trim(coalesce(p->>'description','')), ''),
          nullif(p->>'participants_planned','')::integer)
  returning id into v_id;
  return v_id;
end $$;;

create function update_training(p_id uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare t trainings%rowtype; v_derived boolean; v_need boolean := false; v_r text; k text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into t from trainings where id = p_id for update;
  if not found then raise exception 'Тренинг не найден' using errcode = 'P0015'; end if;
  if t.archived_at is not null then raise exception 'Тренинг в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('title','format','kind','location','hours','start_date','end_date','status',
                 'unplanned_reason','comment','description','participants_planned') then
      raise exception 'Поле «%» нельзя менять здесь (заявка: link_request)', k using errcode = 'P0015';
    end if;
  end loop;
  v_derived := exists (select 1 from training_sessions where training_id = p_id);
  if v_derived and (
       (p_patch ? 'hours' and (p_patch->>'hours')::numeric is distinct from t.hours)
    or (p_patch ? 'start_date' and (p_patch->>'start_date')::date is distinct from t.start_date)
    or (p_patch ? 'end_date' and (p_patch->>'end_date')::date is distinct from t.end_date)) then
    raise exception 'Часы и даты тренинга считаются по заходам: измените заходы' using errcode = 'P0013';
  end if;
  v_need := (p_patch ? 'status' and (p_patch->>'status')::training_status is distinct from t.status)
         or (p_patch ? 'hours' and (p_patch->>'hours')::numeric is distinct from t.hours)
         or (p_patch ? 'start_date' and (p_patch->>'start_date')::date is distinct from t.start_date)
         or (p_patch ? 'end_date' and (p_patch->>'end_date')::date is distinct from t.end_date);
  v_r := case when v_need then req_reason(p_reason) else nullif(trim(coalesce(p_reason, '')), '') end;
  if p_patch ? 'title' and length(trim(coalesce(p_patch->>'title',''))) = 0 then
    raise exception 'Название не может быть пустым' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(v_r, ''), true);
  update trainings set
    title = case when p_patch ? 'title' then trim(p_patch->>'title') else title end,
    format = case when p_patch ? 'format' then (p_patch->>'format')::training_format else format end,
    kind = case when p_patch ? 'kind' then (p_patch->>'kind')::training_kind else kind end,
    location = case when p_patch ? 'location' then nullif(trim(coalesce(p_patch->>'location','')), '') else location end,
    hours = case when p_patch ? 'hours' then (p_patch->>'hours')::numeric else hours end,
    start_date = case when p_patch ? 'start_date' then (p_patch->>'start_date')::date else start_date end,
    end_date = case when p_patch ? 'end_date' then (p_patch->>'end_date')::date else end_date end,
    status = case when p_patch ? 'status' then (p_patch->>'status')::training_status else status end,
    unplanned_reason = case when p_patch ? 'unplanned_reason' then nullif(p_patch->>'unplanned_reason','')::unplanned_reason else unplanned_reason end,
    comment = case when p_patch ? 'comment' then nullif(trim(coalesce(p_patch->>'comment','')), '') else comment end,
    description = case when p_patch ? 'description' then nullif(trim(coalesce(p_patch->>'description','')), '') else description end,
    participants_planned = case when p_patch ? 'participants_planned' then nullif(p_patch->>'participants_planned','')::integer else participants_planned end
  where id = p_id;
end $$;;

revoke execute on function kpi_year(smallint), create_training(jsonb, text), update_training(uuid, jsonb, text) from public, anon;
grant execute on function kpi_year(smallint), create_training(jsonb, text), update_training(uuid, jsonb, text) to authenticated;
