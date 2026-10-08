-- Phase 3A.2 · M21 — сквозной жизненный цикл обучения (EXTEND, без пересоздания существующих функций).
-- Только новые объекты и аддитивные колонки; существующие RPC/таблицы Phase 1–3A.1 не переопределяются.

-- ========== 1. Тренеры: организация, роль в обучении, отдельные RPC ==========
alter table trainers add column organization text;

alter table training_trainers
  add column id uuid not null default gen_random_uuid(),
  add column role text not null default 'CO',
  add column created_at timestamptz not null default now(),
  add constraint training_trainers_id_key unique (id),
  add constraint training_trainers_role_check check (role in ('PRIMARY','CO'));
-- прежние связи: один основной тренер на обучение (детерминированно), остальные — со-тренеры
update training_trainers tt set role = 'PRIMARY'
  from (select distinct on (training_id) training_id, trainer_id from training_trainers order by training_id, trainer_id) x
 where tt.training_id = x.training_id and tt.trainer_id = x.trainer_id;
create unique index training_trainers_one_primary on training_trainers (training_id) where role = 'PRIMARY';
create index training_trainers_trainer_idx on training_trainers (trainer_id);
-- аудит training_trainers уже подключён в Phase 1 (audit_training_trainers); колонка id делает записи адресуемыми

create sequence trainer_code_seq;
create unique index trainers_name_norm_idx on trainers (norm_name(full_name));

create function upsert_trainer(p jsonb, p_trainer uuid default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_name text := trim(coalesce(p->>'full_name', '')); v_id uuid; v_emp uuid := nullif(p->>'employee_id','')::uuid;
        v_kind trainer_kind;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  if p_trainer is null and v_name = '' then raise exception 'Укажите ФИО тренера' using errcode = 'P0015'; end if;
  if v_emp is not null and not exists (select 1 from employees where id = v_emp) then
    raise exception 'Сотрудник не найден' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', 'Справочник тренеров', true);
  if p_trainer is null then
    v_kind := coalesce(nullif(p->>'kind','')::trainer_kind, case when v_emp is not null then 'INTERNAL'::trainer_kind else 'EXTERNAL'::trainer_kind end);
    if exists (select 1 from trainers where norm_name(full_name) = norm_name(v_name)) then
      raise exception 'Тренер «%» уже есть в справочнике', v_name using errcode = 'P0015'; end if;
    insert into trainers(canonical_id, full_name, kind, employee_id, organization)
    values ('TRN-' || lpad(nextval('trainer_code_seq')::text, 4, '0'), v_name, v_kind, v_emp, nullif(trim(coalesce(p->>'organization','')), ''))
    returning id into v_id;
    return v_id;
  end if;
  if not exists (select 1 from trainers where id = p_trainer) then raise exception 'Тренер не найден' using errcode = 'P0015'; end if;
  if p ? 'full_name' and v_name = '' then raise exception 'ФИО не может быть пустым' using errcode = 'P0015'; end if;
  if p ? 'full_name' and exists (select 1 from trainers where norm_name(full_name) = norm_name(v_name) and id <> p_trainer) then
    raise exception 'Тренер «%» уже есть в справочнике', v_name using errcode = 'P0015'; end if;
  update trainers set
    full_name = case when p ? 'full_name' then v_name else full_name end,
    kind = case when p ? 'kind' then (p->>'kind')::trainer_kind else kind end,
    employee_id = case when p ? 'employee_id' then v_emp else employee_id end,
    organization = case when p ? 'organization' then nullif(trim(coalesce(p->>'organization','')), '') else organization end
   where id = p_trainer;
  return p_trainer;
end $$;

create function set_training_trainer(p_training uuid, p_trainer uuid, p_role text default 'CO', p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  if p_role not in ('PRIMARY','CO') then raise exception 'Недопустимая роль тренера' using errcode = 'P0015'; end if;
  if not exists (select 1 from trainings where id = p_training) then raise exception 'Обучение не найдено' using errcode = 'P0015'; end if;
  if exists (select 1 from trainings where id = p_training and archived_at is not null) then
    raise exception 'Обучение в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  if not exists (select 1 from trainers where id = p_trainer) then raise exception 'Тренер не найден' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Назначение тренера'), true);
  if p_role = 'PRIMARY' then
    update training_trainers set role = 'CO' where training_id = p_training and role = 'PRIMARY' and trainer_id <> p_trainer;
  end if;
  insert into training_trainers(training_id, trainer_id, role) values (p_training, p_trainer, p_role)
  on conflict (training_id, trainer_id) do update set role = excluded.role;
end $$;

create function remove_training_trainer(p_training uuid, p_trainer uuid, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  if exists (select 1 from trainings where id = p_training and archived_at is not null) then
    raise exception 'Обучение в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  perform set_config('app.change_reason', req_reason(p_reason), true);
  delete from training_trainers where training_id = p_training and trainer_id = p_trainer;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Тренер не назначен на это обучение' using errcode = 'P0015'; end if;
  -- у заходов этого тренера поле тренера очищается
  update training_sessions set trainer_id = null where training_id = p_training and trainer_id = p_trainer;
end $$;

-- ========== 2. Заходы: время, аудитория, тренер, статус ==========
alter table training_sessions
  add column start_time time, add column end_time time, add column room text,
  add column trainer_id uuid references trainers(id) on delete set null,
  add column status text not null default 'PLANNED',
  add constraint training_sessions_status_check check (status in ('PLANNED','HELD','CANCELLED')),
  add constraint training_sessions_time_check check (start_time is null or end_time is null or end_time > start_time or end_date > start_date);

create function set_session_details(p_session uuid, p jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare s training_sessions%rowtype; v_trainer uuid;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into s from training_sessions where id = p_session for update;
  if not found then raise exception 'Заход не найден' using errcode = 'P0015'; end if;
  if exists (select 1 from trainings where id = s.training_id and archived_at is not null) then
    raise exception 'Обучение в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  v_trainer := case when p ? 'trainer_id' then nullif(p->>'trainer_id','')::uuid else s.trainer_id end;
  if v_trainer is not null and not exists (select 1 from training_trainers where training_id = s.training_id and trainer_id = v_trainer) then
    raise exception 'Тренер захода должен быть назначен на обучение' using errcode = 'P0015'; end if;
  if p ? 'status' and (p->>'status') = 'CANCELLED' and (p->>'status') is distinct from s.status then
    perform set_config('app.change_reason', req_reason(p_reason), true);
  else
    perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Детали захода'), true);
  end if;
  update training_sessions set
    start_time = case when p ? 'start_time' then nullif(p->>'start_time','')::time else start_time end,
    end_time = case when p ? 'end_time' then nullif(p->>'end_time','')::time else end_time end,
    room = case when p ? 'room' then nullif(trim(coalesce(p->>'room','')), '') else room end,
    trainer_id = v_trainer,
    status = case when p ? 'status' then p->>'status' else status end
   where id = p_session;
end $$;

-- ========== 3. Заявка: приоритет, ожидаемый результат; обучение из заявки ==========
alter table training_requests
  add column priority text not null default 'NORMAL',
  add column expected_result text,
  add constraint training_requests_priority_check check (priority in ('LOW','NORMAL','HIGH','URGENT'));

create function set_request_details(p_id uuid, p jsonb) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  if exists (select 1 from training_requests where id = p_id and archived_at is not null) then
    raise exception 'Заявка в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  perform set_config('app.change_reason', 'Детали заявки', true);
  update training_requests set
    priority = case when p ? 'priority' then p->>'priority' else priority end,
    expected_result = case when p ? 'expected_result' then nullif(trim(coalesce(p->>'expected_result','')), '') else expected_result end
   where id = p_id;
  if not found then raise exception 'Заявка не найдена' using errcode = 'P0015'; end if;
end $$;

-- Создание обучения из заявки: данные берутся из заявки, переопределяются только указанные в p; связь сохраняется (trainings.request_id).
create function create_training_from_request(p_request uuid, p jsonb default '{}'::jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare r training_requests%rowtype; v jsonb;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into r from training_requests where id = p_request;
  if not found or r.archived_at is not null then raise exception 'Заявка не найдена или в архиве' using errcode = 'P0015'; end if;
  if r.status not in ('APPROVED','PLANNED') then
    raise exception 'Обучение создаётся из утверждённой или запланированной заявки (сейчас: %)', r.status using errcode = 'P0015'; end if;
  v := jsonb_strip_nulls(jsonb_build_object(
        'title', r.topic, 'description', coalesce(r.goal, r.expected_result), 'participants_planned', r.participants_planned,
        'format', r.format, 'kind', r.kind, 'request_id', r.id, 'comment', r.comment)) || coalesce(p, '{}'::jsonb) ||
       jsonb_build_object('request_id', r.id);
  return create_training(v, coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создано из заявки ' || r.canonical_id));
end $$;

-- ========== 4. Обратная связь: приглашения, ответы, сводка, вес блоков ==========
insert into app_settings(key, value, description) values
  ('feedback_weight_materials', '40', 'Вес блока «Материалы» в итоговой оценке, %'),
  ('feedback_weight_trainer', '40', 'Вес блока «Тренер» в итоговой оценке, %'),
  ('feedback_weight_org', '20', 'Вес блока «Организация» в итоговой оценке, %')
on conflict (key) do nothing;

create table feedback_invitations (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings(id),
  participant_id uuid not null references training_participants(id) on delete cascade,
  employee_id uuid not null references employees(id),
  status text not null default 'INVITED' check (status in ('INVITED','ANSWERED')),
  invited_at timestamptz not null default now(),
  invited_by uuid,
  answered_at timestamptz,
  unique (training_id, participant_id)
);
create index feedback_invitations_training_idx on feedback_invitations (training_id);
create index feedback_invitations_employee_idx on feedback_invitations (employee_id);
alter table feedback_invitations enable row level security;
call grant_table('feedback_invitations', array['ADMIN','ACADEMY_MANAGER','HR']::app_role[], array['ADMIN','ACADEMY_MANAGER']::app_role[]);
create trigger audit_feedback_invitations after insert or update or delete on feedback_invitations
  for each row execute function trg_audit();

-- Приглашение получают участники обучения (отметка «присутствовал»), не посторонние.
create function send_feedback_invitations(p_training uuid, p_reason text default null) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare t trainings%rowtype; v_n integer; v_ft uuid;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into t from trainings where id = p_training;
  if not found then raise exception 'Обучение не найдено' using errcode = 'P0015'; end if;
  if t.archived_at is not null then raise exception 'Обучение в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  if t.status::text not in ('IN_PROGRESS','COMPLETED') then
    raise exception 'Обратную связь можно запросить после начала обучения (статус: %)', t.status using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Запрос обратной связи'), true);
  select id into v_ft from feedback_trainings where training_id = p_training limit 1;
  if v_ft is null then
    insert into feedback_trainings(code, training_id, title, event_date)
    values ('FBT-' || t.canonical_id, p_training, t.title, t.start_date) returning id into v_ft;
  end if;
  insert into feedback_invitations(training_id, participant_id, employee_id, invited_by)
  select p_training, p.id, p.employee_id, auth.uid() from training_participants p
   where p.training_id = p_training and p.attended
  on conflict (training_id, participant_id) do nothing;
  get diagnostics v_n = row_count;
  if v_n > 0 then
    insert into notifications(type, severity, title, body, href, roles, dedupe_key)
    values ('TRAINING_REQUIRES_ACTION', 'INFO', 'Ожидается обратная связь: ' || t.canonical_id, t.title || ' — приглашений: ' || v_n,
            '/trainings/' || p_training || '?tab=feedback', '{ADMIN,ACADEMY_MANAGER}'::app_role[], 'FBREQ|' || p_training || '|' || to_char(now(), 'YYYYMMDDHH24MISS'))
    on conflict do nothing;
  end if;
  return v_n;
end $$;

-- Ввод заполненной анкеты менеджером (бумага/форма). Ответ привязан к обучению; личность хранится отдельно (feedback_respondents).
create function record_feedback_response(p_participant uuid, p_scores jsonb, p_comment text default null) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare inv feedback_invitations%rowtype; v_ft uuid; v_resp uuid; b text; q text; sc smallint; v_any boolean := false; emp employees%rowtype;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into inv from feedback_invitations where participant_id = p_participant for update;
  if not found then raise exception 'Участник не приглашён: анкета без приглашения не принимается' using errcode = 'P0015'; end if;
  if inv.status = 'ANSWERED' then raise exception 'Участник уже ответил' using errcode = 'P0015'; end if;
  if jsonb_typeof(p_scores) <> 'object' then raise exception 'Ожидается объект оценок по блокам' using errcode = 'P0015'; end if;
  select id into v_ft from feedback_trainings where training_id = inv.training_id limit 1;
  select * into emp from employees where id = inv.employee_id;
  perform set_config('app.change_reason', 'Ввод анкеты обратной связи', true);
  insert into feedback_responses(feedback_training_id, submitted_at, comment) values (v_ft, date_trunc('day', now()), nullif(trim(coalesce(p_comment,'')), '')) returning id into v_resp;
  for b in select jsonb_object_keys(p_scores) loop
    if b not in ('MATERIALS','TRAINER','ORG','APPLICATION') then raise exception 'Неизвестный блок %', b using errcode = 'P0015'; end if;
    for q in select jsonb_object_keys(p_scores->b) loop
      sc := (p_scores->b->>q)::smallint;
      if sc < 1 or sc > 5 then raise exception 'Оценка должна быть от 1 до 5' using errcode = 'P0015'; end if;
      insert into feedback_answers(response_id, block, question_no, score) values (v_resp, b::feedback_block, q::smallint, sc);
      v_any := true;
    end loop;
  end loop;
  if not v_any then raise exception 'Нет ни одной оценки' using errcode = 'P0015'; end if;
  insert into feedback_respondents(response_id, employee_id, respondent_raw, dedupe_key, match_status)
  values (v_resp, inv.employee_id, emp.full_name, 'inv|' || inv.id, 'CONFIRMED');
  update feedback_invitations set status = 'ANSWERED', answered_at = now() where id = inv.id;
  return v_resp;
end $$;

-- Сводка обратной связи по обучению. Приватность Phase 1.5: оценки скрыты ниже порога для ролей без права видеть личность.
create function training_feedback_summary(p_training uuid)
returns table(invited integer, answered integer, response_rate numeric, materials numeric, trainer numeric, org numeric, final_score numeric, scores_hidden boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare k int := coalesce((select value::int from app_settings where key = 'feedback_min_group'), 5);
        wm numeric := coalesce((select value::numeric from app_settings where key = 'feedback_weight_materials'), 40);
        wt numeric := coalesce((select value::numeric from app_settings where key = 'feedback_weight_trainer'), 40);
        wo numeric := coalesce((select value::numeric from app_settings where key = 'feedback_weight_org'), 20);
        v_inv int; v_ans int; v_hidden boolean; a_m numeric; a_t numeric; a_o numeric; v_w numeric; v_sum numeric;
begin
  if app_role() is null then raise exception 'Нет доступа' using errcode = '42501'; end if;
  select count(*)::int, count(*) filter (where status = 'ANSWERED')::int into v_inv, v_ans from feedback_invitations where training_id = p_training;
  -- ответы без приглашений (прежние данные) тоже входят в оценку
  select count(*)::int into v_ans from feedback_responses r join feedback_trainings f on f.id = r.feedback_training_id
   where f.training_id = p_training and not r.is_archive;
  v_hidden := v_ans < k and not (app_role() = any (array['ADMIN','ACADEMY_MANAGER']::app_role[]));
  select round(avg(a.score) filter (where a.block = 'MATERIALS'), 2), round(avg(a.score) filter (where a.block = 'TRAINER'), 2),
         round(avg(a.score) filter (where a.block = 'ORG'), 2)
    into a_m, a_t, a_o
    from feedback_answers a join feedback_responses r on r.id = a.response_id join feedback_trainings f on f.id = r.feedback_training_id
   where f.training_id = p_training and not r.is_archive;
  -- итог: веса 40/40/20; если блока нет — веса оставшихся пересчитываются пропорционально
  v_w := wm * (a_m is not null)::int + wt * (a_t is not null)::int + wo * (a_o is not null)::int;
  v_sum := coalesce(a_m * wm, 0) + coalesce(a_t * wt, 0) + coalesce(a_o * wo, 0);
  return query select v_inv, v_ans,
    case when v_inv > 0 then round(least(v_ans, v_inv)::numeric / v_inv * 100, 1) end,
    case when v_hidden then null else a_m end, case when v_hidden then null else a_t end, case when v_hidden then null else a_o end,
    case when v_hidden or v_w = 0 then null else round(v_sum / v_w, 2) end, v_hidden;
end $$;

-- ========== 5. Сводка по обучению (единый источник цифр карточки) ==========
create function training_summary(p_training uuid)
returns table(planned_participants integer, added_participants integer, present_participants integer, completed_participants integer,
              planned_hours numeric, actual_man_hours numeric, actual_cost_tjs numeric, cost_per_participant numeric,
              cost_per_learning_hour numeric, budget_tjs numeric, remaining_budget_tjs numeric, trainers integer, sessions integer)
language sql stable set search_path = public, pg_temp as $$
  select t.participants_planned,
         (select count(*)::int from training_participants where training_id = t.id),
         participants_count(t.id),
         (select count(*)::int from training_participants where training_id = t.id and result in ('COMPLETED','PASSED')),
         t.hours, man_hours(t.id), actual_total(t.id), cost_per_participant(t.id),
         case when has_financial_access() and man_hours(t.id) > 0 then round(actual_total(t.id) / man_hours(t.id), 2) end,
         case when has_financial_access() and r.budget_currency = 'TJS' then r.budget_amount end,
         case when has_financial_access() and r.budget_currency = 'TJS' and r.budget_amount is not null then round(r.budget_amount - actual_total(t.id), 2) end,
         (select count(*)::int from training_trainers where training_id = t.id),
         (select count(*)::int from training_sessions where training_id = t.id)
    from trainings t left join training_requests r on r.id = t.request_id where t.id = p_training
$$;

-- ========== 6. KPI и отчёты на тех же определениях, что и kpi_year ==========
create function lifecycle_kpis(p_year smallint)
returns table(delivered_events integer, planned_events integer, unplanned_events integer, participants integer, unique_trained integer,
              man_hours numeric, certificates_issued integer, exams_total integer, exams_passed integer,
              invited integer, answered integer, response_rate numeric, avg_feedback numeric,
              actual_cost_tjs numeric, cost_per_participant numeric, cost_per_learning_hour numeric)
language sql stable set search_path = public, pg_temp as $$
  with dl as (select t.* from trainings t join learning_event_types et on et.id = t.event_type_id
               where t.archived_at is null and et.is_group and t.status = 'COMPLETED' and extract(year from t.start_date) = p_year),
       fb as (select count(*) filter (where true)::int inv, count(*) filter (where i.status = 'ANSWERED')::int ans
                from feedback_invitations i join dl on dl.id = i.training_id),
       sc as (select round(avg(a.score), 2) s from feedback_answers a join feedback_responses r on r.id = a.response_id
                join feedback_trainings f on f.id = r.feedback_training_id join dl on dl.id = f.training_id where not r.is_archive),
       cost as (select case when has_financial_access() then coalesce(sum(actual_total(dl.id)), 0) end c from dl),
       mh as (select coalesce(sum(man_hours(dl.id)), 0) h, coalesce(sum(participants_count(dl.id)), 0)::int p from dl)
  select (select count(*)::int from dl),
         (select count(*)::int from dl where source_type = 'PLANNED'),
         (select count(*)::int from dl where source_type = 'UNPLANNED'),
         mh.p,
         (select count(distinct p.employee_id)::int from training_participants p join dl on dl.id = p.training_id where p.attended),
         mh.h,
         (select count(*)::int from certificates c where c.archived_at is null and extract(year from c.issue_date) = p_year),
         (select count(*)::int from exams x where x.archived_at is null and extract(year from x.exam_date) = p_year),
         (select count(*)::int from exams x where x.archived_at is null and extract(year from x.exam_date) = p_year and x.result = 'PASSED'),
         fb.inv, fb.ans, case when fb.inv > 0 then round(fb.ans::numeric / fb.inv * 100, 1) end, sc.s,
         cost.c,
         case when cost.c is not null and mh.p > 0 then round(cost.c / mh.p, 2) end,
         case when cost.c is not null and mh.h > 0 then round(cost.c / mh.h, 2) end
    from mh, fb, sc, cost
$$;

create function department_participation(p_year smallint)
returns table(department text, events integer, participants integer, unique_employees integer, man_hours numeric)
language sql stable set search_path = public, pg_temp as $$
  -- подразделение берётся из снимка на момент обучения: последующий перевод сотрудника историю не меняет
  select coalesce(nullif(p.department_snapshot, ''), 'Не указано'), count(distinct t.id)::int, count(*)::int,
         count(distinct p.employee_id)::int,
         coalesce(sum(case when has_attendance(t.id)
              then (select coalesce(sum(s.hours), 0) from session_attendance a join training_sessions s on s.id = a.session_id
                     where a.participant_id = p.id and a.status = 'PRESENT')
              else coalesce((select s.hours from training_sessions s where s.id = p.session_id), t.hours) end), 0)
    from training_participants p join trainings t on t.id = p.training_id join learning_event_types et on et.id = t.event_type_id
   where p.attended and t.archived_at is null and et.is_group and t.status = 'COMPLETED' and extract(year from t.start_date) = p_year
   group by 1 order by 3 desc, 1
$$;

create function trainer_performance(p_year smallint)
returns table(trainer_id uuid, trainer text, kind trainer_kind, organization text, events integer, participants integer, man_hours numeric,
              avg_trainer_score numeric, responses integer, scores_hidden boolean)
language sql stable security definer set search_path = public, pg_temp as $$
  with ok as (select app_role() is not null as ok,
                     coalesce(app_role() = any (array['ADMIN','ACADEMY_MANAGER']::app_role[]), false) as mgr,
                     coalesce((select value::int from app_settings where key = 'feedback_min_group'), 5) as k),
       base as (select tr.id tid, tr.full_name, tr.kind, tr.organization, t.id training_id
                  from trainers tr join training_trainers tt on tt.trainer_id = tr.id join trainings t on t.id = tt.training_id
                  join learning_event_types et on et.id = t.event_type_id
                 where t.archived_at is null and et.is_group and t.status = 'COMPLETED' and extract(year from t.start_date) = p_year),
       agg as (select b.tid, b.full_name, b.kind, b.organization, count(distinct b.training_id)::int ev,
                      coalesce(sum(participants_count(b.training_id)), 0)::int pc, coalesce(sum(man_hours(b.training_id)), 0) mh
                 from base b group by 1,2,3,4),
       fbk as (select b.tid, count(distinct r.id)::int n, round(avg(a.score) filter (where a.block = 'TRAINER'), 2) s
                 from base b join feedback_trainings f on f.training_id = b.training_id
                 join feedback_responses r on r.feedback_training_id = f.id and not r.is_archive
                 join feedback_answers a on a.response_id = r.id group by 1)
  select agg.tid, agg.full_name, agg.kind, agg.organization, agg.ev, agg.pc, agg.mh,
         case when ok.mgr or coalesce(fbk.n, 0) >= ok.k then fbk.s end, coalesce(fbk.n, 0),
         not ok.mgr and coalesce(fbk.n, 0) < ok.k
    from agg left join fbk using (tid) cross join ok where ok.ok order by agg.pc desc, agg.full_name
$$;

-- ========== 7. Результаты участников и сертификаты по обучению ==========
create function training_results(p_training uuid)
returns table(participant_id uuid, employee_id uuid, full_name text, attended boolean, sessions_present integer, sessions_total integer,
              result text, status text, certificate_id uuid, certificate_number text, exam_result text)
language sql stable set search_path = public, pg_temp as $$
  select p.id, p.employee_id, e.full_name, p.attended,
         (select count(*)::int from session_attendance a where a.participant_id = p.id and a.status = 'PRESENT'),
         (select count(*)::int from training_sessions s where s.training_id = p.training_id),
         p.result,
         case when exists (select 1 from certificates c where c.employee_id = p.employee_id and c.training_id = p.training_id and c.archived_at is null and c.revoked_at is null) then 'CERTIFIED'
              when p.result in ('COMPLETED','PASSED') then 'COMPLETED'
              when p.result = 'FAILED' then 'FAILED'
              when p.result = 'NOT_COMPLETED' then 'NOT_COMPLETED'
              when not p.attended then 'ABSENT'
              when exists (select 1 from session_attendance a where a.participant_id = p.id and a.status <> 'PRESENT')
                   and exists (select 1 from session_attendance a where a.participant_id = p.id and a.status = 'PRESENT') then 'PARTIAL'
              else 'ENROLLED' end,
         (select c.id from certificates c where c.employee_id = p.employee_id and c.training_id = p.training_id and c.archived_at is null order by c.issue_date desc limit 1),
         (select c.certificate_number from certificates c where c.employee_id = p.employee_id and c.training_id = p.training_id and c.archived_at is null order by c.issue_date desc limit 1),
         (select x.result from exams x where x.employee_id = p.employee_id and x.training_id = p.training_id and x.archived_at is null order by x.attempt_no desc limit 1)
    from training_participants p join employees e on e.id = p.employee_id where p.training_id = p_training order by e.full_name
$$;

-- ========== 8. Поиск: тренеры и документы мероприятий (global_search не переопределяется) ==========
create function global_search_ext(p_q text, p_limit integer default 8)
returns table(kind text, id text, title text, subtitle text, href text)
language plpgsql stable set search_path = public, pg_temp as $$
declare q text := '%' || replace(replace(replace(trim(coalesce(p_q,'')), '\', '\\'), '%', '\%'), '_', '\_') || '%'; l integer := greatest(least(coalesce(p_limit, 8), 20), 1);
begin
  if app_role() is null or length(trim(coalesce(p_q,''))) < 2 then return; end if;
  return query select 'TRAINER', tr.id::text, tr.full_name, tr.canonical_id || ' · ' || tr.kind || coalesce(' · ' || tr.organization, ''), '/trainers/' || tr.id
    from trainers tr where tr.full_name ilike q or tr.canonical_id ilike q or coalesce(tr.organization,'') ilike q order by tr.full_name limit l;
  -- документы мероприятий; финансовые типы скрывает RLS таблицы documents
  return query select 'DOCUMENT', d.id::text, d.title, d.doc_type || coalesce(' · ' || t.canonical_id, ''),
         case when d.training_id is not null then '/trainings/' || d.training_id || '?tab=documents'
              when d.employee_id is not null then '/employees/' || d.employee_id || '?tab=documents' else '/certificates' end
    from documents d left join trainings t on t.id = d.training_id
   where d.archived_at is null and d.title ilike q order by d.uploaded_at desc limit l;
end $$;

-- ========== 9. Data Quality: сквозные правила жизненного цикла ==========
create function dq_scan_lifecycle() returns table(opened integer, auto_fixed integer, total_open integer)
language plpgsql security definer set search_path = public, pg_temp as $$
declare n_new integer; n_fixed integer;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  create temp table _dq_found(rule_code text, severity dq_severity, entity_table text, entity_id text, message text, suggestion text, details jsonb) on commit drop;

  insert into _dq_found select 'TRAINING_NO_TRAINER', 'WARNING', 'trainings', t.id::text,
         'У мероприятия «' || t.title || '» не назначен тренер.', 'Назначьте основного тренера на вкладке «Тренеры».',
         jsonb_build_object('training_id', t.id)
    from trainings t where t.archived_at is null and t.status in ('IN_PROGRESS','COMPLETED')
     and not exists (select 1 from training_trainers x where x.training_id = t.id);

  insert into _dq_found select 'FEEDBACK_NO_TRAINING', 'CRITICAL', 'feedback_trainings', f.id::text,
         'Обратная связь «' || f.title || '» не привязана к обучению.', 'Свяжите набор анкет с обучением.',
         jsonb_build_object('feedback_training_id', f.id)
    from feedback_trainings f where f.training_id is null and exists (select 1 from feedback_responses r where r.feedback_training_id = f.id);

  insert into _dq_found select 'FEEDBACK_NON_PARTICIPANT', 'ERROR', 'feedback_trainings', f.id::text,
         'Обратную связь по «' || f.title || '» дал сотрудник, которого нет среди участников (' || fr.n || ').', 'Проверьте участников или сопоставление респондентов.',
         jsonb_build_object('training_id', f.training_id, 'count', fr.n)
    from feedback_trainings f
    join lateral (select count(*)::int n from feedback_responses r join feedback_respondents x on x.response_id = r.id
                   where r.feedback_training_id = f.id and x.employee_id is not null
                     and not exists (select 1 from training_participants p where p.training_id = f.training_id and p.employee_id = x.employee_id)) fr on fr.n > 0
   where f.training_id is not null;

  insert into _dq_found select 'FEEDBACK_NO_INVITATION', 'WARNING', 'feedback_trainings', f.id::text,
         'Ответов по «' || f.title || '» больше, чем приглашений (' || fr.n || ' > ' || iv.n || ').', 'Ответы без приглашений нужно проверить.',
         jsonb_build_object('training_id', f.training_id, 'responses', fr.n, 'invitations', iv.n)
    from feedback_trainings f
    join lateral (select count(*)::int n from feedback_invitations i where i.training_id = f.training_id) iv on iv.n > 0
    join lateral (select count(*)::int n from feedback_responses r where r.feedback_training_id = f.id and not r.is_archive) fr on fr.n > iv.n
   where f.training_id is not null;

  insert into _dq_found select 'CERT_NOT_PARTICIPANT', 'WARNING', 'certificates', c.id::text,
         'Сертификат «' || c.name || '» выдан по обучению, где сотрудник не участник.', 'Добавьте сотрудника в участники или уберите связь с обучением.',
         jsonb_build_object('employee_id', c.employee_id, 'training_id', c.training_id)
    from certificates c where c.archived_at is null and c.training_id is not null
     and not exists (select 1 from training_participants p where p.training_id = c.training_id and p.employee_id = c.employee_id);

  insert into _dq_found select 'EXPENSE_ON_CANCELLED', 'WARNING', 'trainings', t.id::text,
         'По мероприятию «' || t.title || '» (' || t.status || ') есть расходы.', 'Подтвердите расходы (штрафы, предоплата) или аннулируйте ошибочные.',
         jsonb_build_object('training_id', t.id)
    from trainings t where t.archived_at is null and t.status in ('CANCELLED','NOT_HELD')
     and exists (select 1 from expense_operations o where o.training_id = t.id and o.voided_at is null);

  insert into _dq_found select 'SESSION_OUTSIDE_RANGE', 'ERROR', 'training_sessions', s.id::text,
         'Заход №' || s.session_no || ' выходит за даты мероприятия «' || t.title || '».', 'Исправьте даты захода.',
         jsonb_build_object('training_id', t.id)
    from training_sessions s join trainings t on t.id = s.training_id
   where t.archived_at is null and (s.start_date < t.start_date or s.end_date > t.end_date);

  insert into _dq_found select 'ATTENDANCE_ON_CANCELLED_SESSION', 'ERROR', 'training_sessions', s.id::text,
         'На отменённом заходе №' || s.session_no || ' отмечены присутствующие.', 'Снимите отметки или верните статус захода.',
         jsonb_build_object('training_id', s.training_id)
    from training_sessions s where s.status = 'CANCELLED'
     and exists (select 1 from session_attendance a where a.session_id = s.id and a.status = 'PRESENT');

  insert into _dq_found select 'PARTICIPANT_NO_SNAPSHOT', 'WARNING', 'training_participants', p.id::text,
         'У участника нет снимка подразделения на момент обучения.', 'Укажите подразделение сотрудника — снимок защищает историю аналитики.',
         jsonb_build_object('training_id', p.training_id, 'employee_id', p.employee_id)
    from training_participants p join trainings t on t.id = p.training_id
   where t.archived_at is null and p.department_snapshot is null and exists (select 1 from employees e where e.id = p.employee_id and e.department_id is not null);

  insert into _dq_found select 'PARTICIPANT_NO_RESULT', 'INFO', 'trainings', t.id::text,
         'У «' || t.title || '» завершено, но у ' || x.n || ' участников не указан результат.', 'Отметьте результат на вкладке «Результаты».',
         jsonb_build_object('training_id', t.id, 'count', x.n)
    from trainings t join lateral (select count(*)::int n from training_participants p where p.training_id = t.id and p.attended and p.result is null) x on x.n > 0
   where t.archived_at is null and t.status = 'COMPLETED';

  insert into _dq_found select 'COMPLETED_NO_FEEDBACK_REQUEST', 'INFO', 'trainings', t.id::text,
         'Обучение «' || t.title || '» завершено, обратная связь не запрашивалась.', 'Нажмите «Отправить обратную связь» на вкладке «Обратная связь».',
         jsonb_build_object('training_id', t.id)
    from trainings t join learning_event_types et on et.id = t.event_type_id
   where t.archived_at is null and et.is_group and t.status = 'COMPLETED' and t.end_date < current_date - 7
     and exists (select 1 from training_participants p where p.training_id = t.id and p.attended)
     and not exists (select 1 from feedback_invitations i where i.training_id = t.id)
     and not exists (select 1 from feedback_trainings f where f.training_id = t.id);

  insert into dq_issues(rule_code, severity, entity_table, entity_id, message, suggestion, details, fingerprint, source)
  select f.rule_code, f.severity, f.entity_table, f.entity_id, f.message, f.suggestion, f.details, f.rule_code || '|' || f.entity_table || '|' || f.entity_id, 'RULE'
    from _dq_found f
  on conflict (fingerprint) where fingerprint is not null do update
     set message = excluded.message, suggestion = excluded.suggestion, details = excluded.details, severity = excluded.severity, updated_at = now(),
         status = case when dq_issues.status = 'FIXED' then 'OPEN' else dq_issues.status end,
         resolved_by = case when dq_issues.status = 'FIXED' then null else dq_issues.resolved_by end,
         resolved_at = case when dq_issues.status = 'FIXED' then null else dq_issues.resolved_at end,
         resolution  = case when dq_issues.status = 'FIXED' then null else dq_issues.resolution end
  where dq_issues.status in ('OPEN','IN_REVIEW','FIXED');
  get diagnostics n_new = row_count;

  update dq_issues d set status = 'FIXED', resolved_at = now(), resolved_by = auth.uid(),
         resolution = 'Исправлено: условие больше не выполняется', updated_at = now()
   where d.source = 'RULE' and d.status in ('OPEN','IN_REVIEW')
     and d.rule_code in ('TRAINING_NO_TRAINER','FEEDBACK_NO_TRAINING','FEEDBACK_NON_PARTICIPANT','FEEDBACK_NO_INVITATION','CERT_NOT_PARTICIPANT',
                         'EXPENSE_ON_CANCELLED','SESSION_OUTSIDE_RANGE','ATTENDANCE_ON_CANCELLED_SESSION','PARTICIPANT_NO_SNAPSHOT',
                         'PARTICIPANT_NO_RESULT','COMPLETED_NO_FEEDBACK_REQUEST')
     and not exists (select 1 from _dq_found f where d.fingerprint = f.rule_code || '|' || f.entity_table || '|' || f.entity_id);
  get diagnostics n_fixed = row_count;

  drop table _dq_found;
  return query select coalesce(n_new, 0), coalesce(n_fixed, 0), (select count(*)::int from dq_issues where status in ('OPEN','IN_REVIEW'));
end $$;

-- ========== 10. Права на функции ==========
do $$ declare f text; begin
  foreach f in array array[
    'upsert_trainer(jsonb, uuid)', 'set_training_trainer(uuid, uuid, text, text)', 'remove_training_trainer(uuid, uuid, text)',
    'set_session_details(uuid, jsonb, text)', 'set_request_details(uuid, jsonb)', 'create_training_from_request(uuid, jsonb, text)',
    'send_feedback_invitations(uuid, text)', 'record_feedback_response(uuid, jsonb, text)', 'training_feedback_summary(uuid)',
    'training_summary(uuid)', 'lifecycle_kpis(smallint)', 'department_participation(smallint)', 'trainer_performance(smallint)',
    'training_results(uuid)', 'global_search_ext(text, integer)', 'dq_scan_lifecycle()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
