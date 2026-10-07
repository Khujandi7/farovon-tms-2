-- Phase 3A.1 · M14: Learning Events. Единая модель мероприятия = расширенная таблица trainings.
-- Типы мероприятий — справочник (ADMIN добавляет в интерфейсе), провайдеры/организаторы — справочник,
-- lifecycle расширен (DRAFT, APPROVED, REGISTERED), переходы проверяет БД. Определения KPI не меняются.

-- ---------- Новые значения lifecycle (использовать в этой же транзакции нельзя — только в телах функций) ----------
alter type training_status add value if not exists 'DRAFT' before 'PLANNED';
alter type training_status add value if not exists 'APPROVED' after 'PLANNED';
alter type training_status add value if not exists 'REGISTERED' after 'APPROVED';

-- ---------- Справочник типов ----------
create table learning_event_types (
  id smallint generated always as identity primary key,
  code text not null unique check (code ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  name text not null check (length(trim(name)) > 0),
  is_system boolean not null default false,   -- системный: код нельзя менять/удалять, логика приложения на него опирается
  is_group boolean not null default true,     -- групповое мероприятие: учитывается в KPI «проведено обучений»
  sort_order smallint not null default 100,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into learning_event_types(code, name, is_system, is_group, sort_order) values
  ('TRAINING', 'Обучение', true, true, 10),
  ('SEMINAR', 'Семинар', true, true, 20),
  ('FORUM', 'Форум', true, true, 30),
  ('CONFERENCE', 'Конференция', true, true, 40),
  ('WORKSHOP', 'Практикум', true, true, 50),
  ('MASTERCLASS', 'Мастер-класс', true, true, 60),
  ('WEBINAR', 'Вебинар', true, true, 70),
  ('COURSE', 'Курс', true, true, 80),
  ('CERTIFICATION_PREP', 'Подготовка к сертификации', true, true, 90),
  ('EXAM', 'Экзамен (групповой)', true, true, 100),
  ('INDIVIDUAL_EDUCATION', 'Индивидуальное обучение', true, false, 110),
  ('OTHER', 'Другое', true, true, 999);

-- ---------- Провайдеры / организаторы ----------
create table learning_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  name_norm text not null,
  kind text not null default 'EXTERNAL' check (kind in ('INTERNAL','EXTERNAL','ORGANIZATION')),
  contact text,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id)
);
create unique index learning_providers_name_idx on learning_providers (name_norm);
create index learning_providers_created_by_idx on learning_providers (created_by);

-- ---------- trainings: тип, провайдер, итог ----------
alter table trainings
  add column event_type_id smallint references learning_event_types(id),
  add column provider_id uuid references learning_providers(id),
  add column organizer text,
  add column result_summary text;
update trainings set event_type_id = (select id from learning_event_types where code = 'TRAINING');
alter table trainings alter column event_type_id set not null;
create index trainings_event_type_idx on trainings (event_type_id);
create index trainings_provider_idx on trainings (provider_id);

-- Тип по умолчанию — «Обучение»: прежние вставки (тесты Phase 1, импорт) продолжают работать без изменений.
create function trg_training_default_type() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.event_type_id is null then
    select id into new.event_type_id from learning_event_types where code = 'TRAINING';
  end if;
  return new;
end $$;
create trigger trainings_default_type before insert on trainings
  for each row execute function trg_training_default_type();
-- у DRAFT может не быть выбрано всего — но даты и часы остаются обязательными (прежние ограничения)

-- ---------- Результат участника (индивидуальное обучение, итог курса) ----------
alter table training_participants
  add column result text check (result in ('COMPLETED','NOT_COMPLETED','PASSED','FAILED')),
  add column result_note text;

-- ---------- Lifecycle: допустимые переходы проверяет сервер ----------
create function training_transition_allowed(p_from text, p_to text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select p_from = p_to or case p_from
    when 'DRAFT' then p_to in ('PLANNED','CANCELLED')
    when 'PLANNED' then p_to in ('DRAFT','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED','POSTPONED','NOT_HELD')
    when 'APPROVED' then p_to in ('PLANNED','REGISTERED','IN_PROGRESS','COMPLETED','CANCELLED','POSTPONED')
    when 'REGISTERED' then p_to in ('APPROVED','IN_PROGRESS','COMPLETED','CANCELLED','POSTPONED')
    when 'IN_PROGRESS' then p_to in ('PLANNED','COMPLETED','CANCELLED','POSTPONED')
    when 'COMPLETED' then p_to in ('IN_PROGRESS')
    when 'CANCELLED' then p_to in ('DRAFT','PLANNED')
    when 'POSTPONED' then p_to in ('PLANNED','APPROVED','REGISTERED','IN_PROGRESS','CANCELLED','NOT_HELD')
    when 'NOT_HELD' then p_to in ('PLANNED','POSTPONED')
    else false end
$$;

-- ADMIN может исправить любой переход (с обязательной причиной, её требует update_training); откат (app.confirmed) не блокируется
create function trg_training_status_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.status is distinct from old.status
     and current_setting('app.confirmed', true) is distinct from 'yes'
     and current_user::text in ('authenticated','anon')
     and app_role() is distinct from 'ADMIN'
     and not training_transition_allowed(old.status::text, new.status::text) then
    raise exception 'Переход статуса «%» → «%» не разрешён', old.status, new.status using errcode = 'P0016';
  end if;
  return new;
end $$;
create trigger trainings_status_guard before update of status on trainings
  for each row execute function trg_training_status_guard();

-- ---------- Права и аудит справочников ----------
create trigger audit_learning_event_types after insert or update or delete on learning_event_types
  for each row execute function trg_audit();
create trigger audit_learning_providers after insert or update or delete on learning_providers
  for each row execute function trg_audit();
alter table learning_event_types enable row level security;
alter table learning_providers enable row level security;
call grant_table('learning_event_types', array['ADMIN','ACADEMY_MANAGER','HR','FINANCE','VIEWER']::app_role[], array['ADMIN']::app_role[]);
call grant_table('learning_providers', array['ADMIN','ACADEMY_MANAGER','HR','FINANCE','VIEWER']::app_role[], array['ADMIN','ACADEMY_MANAGER']::app_role[]);

-- audit_log.row_id для справочника с identity-id: trg_audit берёт j->>'id' — работает и для smallint

-- ---------- Представление списка: + тип и провайдер ----------
create or replace view v_training_list as
select t.id, t.canonical_id, t.title, t.format, t.kind, t.status, t.source_type, t.source_confirmed, t.hours, t.start_date, t.end_date,
       t.location, t.request_id, t.archived_at, t.participants_planned,
       participants_count(t.id) as participants, man_hours(t.id) as man_hours, actual_total(t.id) as actual_tjs,
       has_attendance(t.id) as attendance_mode,
       et.code as event_type_code, et.name as event_type_name, t.event_type_id, t.provider_id, t.organizer
  from trainings t join learning_event_types et on et.id = t.event_type_id;

-- ---------- KPI: определения прежние; считаем только групповые мероприятия (всё прежнее — «Обучение») ----------
create or replace function kpi_year(p_year smallint)
returns table(financial_access financial_access, plan_status text, plan_usd numeric, plan_tjs numeric, financial_actual_tjs numeric,
              variance_tjs numeric, delivered_count integer, delivered_unique_participants integer, delivered_man_hours numeric,
              in_progress_count integer, unplanned_delivered_count integer, unplanned_delivered_pct numeric,
              unplanned_unconfirmed_count integer, unplanned_financial_actual_tjs numeric)
language sql stable set search_path = public, pg_temp as $$
  with ver as (
    select approved_version(p_year) as v,
           has_financial_access() as ok,
           (select value::numeric from app_settings where key = 'budget_fx_usd_tjs') as fx),
  tr as (select t.* from trainings t join learning_event_types et on et.id = t.event_type_id
          where t.archived_at is null and et.is_group and extract(year from t.start_date) = p_year),
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
$$;

-- ---------- create_training / update_training: тип, провайдер, организатор, итог ----------
create or replace function create_training(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_title text := trim(coalesce(p->>'title', ''));
        v_start date := nullif(p->>'start_date','')::date;
        v_end date; v_hours numeric := nullif(p->>'hours','')::numeric;
        v_req uuid := nullif(p->>'request_id','')::uuid; v_src source_type;
        v_type smallint; v_prov uuid := nullif(p->>'provider_id','')::uuid;
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
  if nullif(p->>'event_type_id','') is not null then
    select id into v_type from learning_event_types where id = (p->>'event_type_id')::smallint and is_active;
  elsif nullif(p->>'event_type_code','') is not null then
    select id into v_type from learning_event_types where code = p->>'event_type_code' and is_active;
  else
    select id into v_type from learning_event_types where code = 'TRAINING';
  end if;
  if v_type is null then raise exception 'Неизвестный или отключённый тип мероприятия' using errcode = 'P0015'; end if;
  if v_prov is not null and not exists (select 1 from learning_providers where id = v_prov and is_active) then
    raise exception 'Провайдер не найден или отключён' using errcode = 'P0015'; end if;
  v_src := case when v_req is null then 'UNPLANNED' else 'PLANNED' end;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создание мероприятия'), true);
  insert into trainings(canonical_id, title, format, kind, location, hours, start_date, end_date, status,
                        source_type, source_confirmed, request_id, unplanned_reason, comment, description, participants_planned,
                        event_type_id, provider_id, organizer)
  values (next_training_code(extract(year from v_start)::int), v_title,
          coalesce(nullif(p->>'format','')::training_format, 'OFFLINE'),
          coalesce(nullif(p->>'kind','')::training_kind, 'UNSPECIFIED'),
          nullif(trim(coalesce(p->>'location','')), ''), v_hours, v_start, v_end,
          coalesce(nullif(p->>'status','')::training_status, 'PLANNED'),
          v_src, true, v_req,
          case when v_src = 'UNPLANNED' then nullif(p->>'unplanned_reason','')::unplanned_reason end,
          nullif(trim(coalesce(p->>'comment','')), ''), nullif(trim(coalesce(p->>'description','')), ''),
          nullif(p->>'participants_planned','')::integer,
          v_type, v_prov, nullif(trim(coalesce(p->>'organizer','')), ''))
  returning id into v_id;
  return v_id;
end $$;

create or replace function update_training(p_id uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare t trainings%rowtype; v_derived boolean; v_need boolean := false; v_r text; k text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into t from trainings where id = p_id for update;
  if not found then raise exception 'Тренинг не найден' using errcode = 'P0015'; end if;
  if t.archived_at is not null then raise exception 'Тренинг в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('title','format','kind','location','hours','start_date','end_date','status',
                 'unplanned_reason','comment','description','participants_planned',
                 'event_type_id','provider_id','organizer','result_summary') then
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
  if p_patch ? 'event_type_id' and not exists (select 1 from learning_event_types where id = (p_patch->>'event_type_id')::smallint and is_active) then
    raise exception 'Неизвестный или отключённый тип мероприятия' using errcode = 'P0015'; end if;
  if p_patch ? 'provider_id' and nullif(p_patch->>'provider_id','') is not null
     and not exists (select 1 from learning_providers where id = (p_patch->>'provider_id')::uuid and is_active) then
    raise exception 'Провайдер не найден или отключён' using errcode = 'P0015'; end if;
  v_need := (p_patch ? 'status' and (p_patch->>'status')::training_status is distinct from t.status)
         or (p_patch ? 'hours' and (p_patch->>'hours')::numeric is distinct from t.hours)
         or (p_patch ? 'start_date' and (p_patch->>'start_date')::date is distinct from t.start_date)
         or (p_patch ? 'end_date' and (p_patch->>'end_date')::date is distinct from t.end_date)
         or (p_patch ? 'event_type_id' and (p_patch->>'event_type_id')::smallint is distinct from t.event_type_id);
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
    participants_planned = case when p_patch ? 'participants_planned' then nullif(p_patch->>'participants_planned','')::integer else participants_planned end,
    event_type_id = case when p_patch ? 'event_type_id' then (p_patch->>'event_type_id')::smallint else event_type_id end,
    provider_id = case when p_patch ? 'provider_id' then nullif(p_patch->>'provider_id','')::uuid else provider_id end,
    organizer = case when p_patch ? 'organizer' then nullif(trim(coalesce(p_patch->>'organizer','')), '') else organizer end,
    result_summary = case when p_patch ? 'result_summary' then nullif(trim(coalesce(p_patch->>'result_summary','')), '') else result_summary end
  where id = p_id;
end $$;

-- ---------- Управление типами и провайдерами (ADMIN; провайдеры — ADMIN и ACADEMY_MANAGER) ----------
create function upsert_event_type(p_id smallint, p jsonb, p_reason text default null) returns smallint
language plpgsql set search_path = public, pg_temp as $$
declare v_id smallint; v_code text := upper(trim(coalesce(p->>'code','')));
begin
  perform req_role('{ADMIN}'::app_role[]);
  if length(trim(coalesce(p->>'name',''))) = 0 then raise exception 'Укажите название типа' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Справочник типов'), true);
  if p_id is null then
    if v_code !~ '^[A-Z][A-Z0-9_]{1,39}$' then raise exception 'Код типа: латиница, цифры и «_» (2–40 символов)' using errcode = 'P0015'; end if;
    insert into learning_event_types(code, name, is_group, sort_order)
    values (v_code, trim(p->>'name'), coalesce((p->>'is_group')::boolean, true), coalesce((p->>'sort_order')::smallint, 200))
    returning id into v_id;
  else
    update learning_event_types set
      name = case when p ? 'name' then trim(p->>'name') else name end,
      is_group = case when p ? 'is_group' and not is_system then (p->>'is_group')::boolean else is_group end,
      sort_order = case when p ? 'sort_order' then (p->>'sort_order')::smallint else sort_order end,
      is_active = case when p ? 'is_active' and code <> 'TRAINING' then (p->>'is_active')::boolean else is_active end
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Тип не найден' using errcode = 'P0015'; end if;
  end if;
  return v_id;
end $$;

create function upsert_provider(p_id uuid, p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_name text := trim(coalesce(p->>'name',''));
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  if v_name = '' then raise exception 'Укажите название провайдера' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Справочник провайдеров'), true);
  if p_id is null then
    insert into learning_providers(name, name_norm, kind, contact, note, created_by)
    values (v_name, norm_name(v_name), coalesce(nullif(p->>'kind',''), 'EXTERNAL'), nullif(trim(coalesce(p->>'contact','')), ''),
            nullif(trim(coalesce(p->>'note','')), ''), auth.uid())
    returning id into v_id;
  else
    update learning_providers set
      name = case when p ? 'name' then v_name else name end,
      name_norm = case when p ? 'name' then norm_name(v_name) else name_norm end,
      kind = case when p ? 'kind' then p->>'kind' else kind end,
      contact = case when p ? 'contact' then nullif(trim(coalesce(p->>'contact','')), '') else contact end,
      note = case when p ? 'note' then nullif(trim(coalesce(p->>'note','')), '') else note end,
      is_active = case when p ? 'is_active' then (p->>'is_active')::boolean else is_active end
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Провайдер не найден' using errcode = 'P0015'; end if;
  end if;
  return v_id;
end $$;

revoke execute on function trg_training_default_type(), trg_training_status_guard() from public, anon, authenticated, service_role;
revoke execute on function training_transition_allowed(text, text), upsert_event_type(smallint, jsonb, text),
  upsert_provider(uuid, jsonb, text) from public, anon;
grant execute on function training_transition_allowed(text, text), upsert_event_type(smallint, jsonb, text),
  upsert_provider(uuid, jsonb, text) to authenticated;
