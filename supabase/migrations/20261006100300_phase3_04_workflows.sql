-- Phase 3 · M13: рабочие процессы (RPC). Вся бизнес-логика — в PostgreSQL.
-- Принцип: проверка роли → проверка данных → причина (где обязательна) → запись → аудит (триггеры) → пересчёт (триггеры/функции).
-- Коды ошибок: P0012 — нет причины, P0013 — поле вычисляется из заходов, P0014 — откат невозможен (поле изменено позже),
-- P0015 — недопустимые данные. Остальные — из прежних миграций.

-- ---------- Нормализация ФИО и коды ----------
create function norm_name(p text) returns text language sql immutable
set search_path = public, pg_temp as $$
  select trim(regexp_replace(regexp_replace(lower(replace(replace(coalesce(p, ''), 'ё', 'е'), 'Ё', 'е')),
         '[^[:alnum:]\s]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create function next_request_code(p_year integer) returns text language plpgsql
set search_path = public, pg_temp as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('request_code'));
  select coalesce(max(substring(canonical_id from '^REQ-' || p_year || '-(\d+)$')::int), 0) + 1 into n
    from training_requests where canonical_id like 'REQ-' || p_year || '-%';
  return 'REQ-' || p_year || '-' || lpad(n::text, 3, '0');
end $$;

create function next_employee_code() returns text language plpgsql
set search_path = public, pg_temp as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('employee_code'));
  select coalesce(max(substring(canonical_id from '^EMP-(\d+)$')::int), 0) + 1 into n from employees;
  return 'EMP-' || lpad(n::text, 5, '0');
end $$;

-- ---------- Тренинги ----------
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
end $$;

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
end $$;

-- Привязка заявки. Для внепланового тренинга привязка заявки требует явного подтверждения (P0002).
create function link_request(p_training uuid, p_request uuid, p_source_type source_type default null,
                             p_confirm boolean default false, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare t trainings%rowtype; v_r text := req_reason(p_reason); v_src source_type;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into t from trainings where id = p_training for update;
  if not found then raise exception 'Тренинг не найден' using errcode = 'P0015'; end if;
  if t.archived_at is not null then raise exception 'Тренинг в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  if p_request is not null and not exists (select 1 from training_requests where id = p_request and archived_at is null) then
    raise exception 'Заявка не найдена или в архиве' using errcode = 'P0015';
  end if;
  v_src := coalesce(p_source_type, case when p_request is null and t.source_type = 'PLANNED' then 'UNPLANNED' else t.source_type end);
  if p_request is not null and v_src = 'UNPLANNED' and not p_confirm then
    raise exception 'Обучение внеплановое. Привязка заявки требует подтверждения.' using errcode = 'P0002';
  end if;
  perform set_config('app.change_reason', v_r, true);
  if p_request is not null and v_src = 'UNPLANNED' then perform set_config('app.confirmed', 'yes', true); end if;
  update trainings set request_id = p_request, source_type = v_src, source_confirmed = true,
         unplanned_reason = case when v_src = 'PLANNED' then null else unplanned_reason end
   where id = p_training;
end $$;

-- Архив / восстановление (логическое удаление)
create function set_training_archived(p_id uuid, p_archived boolean, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_r text := req_reason(p_reason);
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  perform set_config('app.change_reason', v_r, true);
  if p_archived then
    if exists (select 1 from expense_operations where training_id = p_id and voided_at is null) then
      raise exception 'У тренинга есть расходы: архивировать нельзя. Установите статус CANCELLED или NOT_HELD' using errcode = 'P0005';
    end if;
    update trainings set archived_at = now(), archived_by = auth.uid(), archive_reason = v_r
     where id = p_id and archived_at is null;
  else
    update trainings set archived_at = null, archived_by = null, archive_reason = null
     where id = p_id and archived_at is not null;
  end if;
  if not found then raise exception 'Тренинг не найден или уже в нужном состоянии' using errcode = 'P0015'; end if;
end $$;

-- ---------- Заявки ----------
create function create_request(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_topic text := trim(coalesce(p->>'topic', ''));
        v_year smallint := nullif(p->>'plan_year','')::smallint; v_amount numeric := nullif(p->>'budget_amount','')::numeric;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  if v_topic = '' then raise exception 'Укажите тему заявки' using errcode = 'P0015'; end if;
  if v_year is null then raise exception 'Укажите год плана' using errcode = 'P0015'; end if;
  if v_amount is not null and v_amount < 0 then raise exception 'Бюджет не может быть отрицательным' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создание заявки'), true);
  insert into training_requests(canonical_id, plan_year, request_date, department_id, unit_id, requester_id, requester_raw,
      topic, direction, goal, participants_planned, format, kind, trainer_raw, budget_amount, budget_currency,
      period_raw, status, comment, carry_forward, planned_year)
  values (next_request_code(v_year), v_year, nullif(p->>'request_date','')::date,
      nullif(p->>'department_id','')::bigint, nullif(p->>'unit_id','')::bigint, nullif(p->>'requester_id','')::uuid,
      nullif(trim(coalesce(p->>'requester_raw','')), ''), v_topic,
      nullif(trim(coalesce(p->>'direction','')), ''), nullif(trim(coalesce(p->>'goal','')), ''),
      nullif(p->>'participants_planned','')::integer, nullif(p->>'format','')::training_format,
      coalesce(nullif(p->>'kind','')::training_kind, 'UNSPECIFIED'), nullif(trim(coalesce(p->>'trainer_raw','')), ''),
      v_amount, case when v_amount is not null then 'TJS'::currency_code end,   -- новые заявки только в TJS
      nullif(trim(coalesce(p->>'period_raw','')), ''),
      coalesce(nullif(p->>'status','')::request_status, 'NEW'),
      nullif(trim(coalesce(p->>'comment','')), ''), coalesce((p->>'carry_forward')::boolean, false),
      nullif(p->>'planned_year','')::smallint)
  returning id into v_id;
  return v_id;
end $$;

create function update_request(p_id uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare r training_requests%rowtype; k text; v_need boolean; v_r text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into r from training_requests where id = p_id for update;
  if not found then raise exception 'Заявка не найдена' using errcode = 'P0015'; end if;
  if r.archived_at is not null then raise exception 'Заявка в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('plan_year','request_date','department_id','unit_id','requester_id','requester_raw','topic','direction',
                 'goal','participants_planned','format','kind','trainer_raw','budget_amount','period_raw','status',
                 'comment','carry_forward','planned_year') then
      raise exception 'Поле «%» нельзя менять', k using errcode = 'P0015';
    end if;
  end loop;
  if p_patch ? 'topic' and length(trim(coalesce(p_patch->>'topic',''))) = 0 then
    raise exception 'Тема не может быть пустой' using errcode = 'P0015'; end if;
  if p_patch ? 'budget_amount' and nullif(p_patch->>'budget_amount','') is not null
     and (p_patch->>'budget_amount')::numeric < 0 then
    raise exception 'Бюджет не может быть отрицательным' using errcode = 'P0015'; end if;
  v_need := (p_patch ? 'status' and (p_patch->>'status')::request_status is distinct from r.status)
         or (p_patch ? 'budget_amount' and nullif(p_patch->>'budget_amount','')::numeric is distinct from r.budget_amount)
         or (p_patch ? 'carry_forward' and (p_patch->>'carry_forward')::boolean is distinct from r.carry_forward);
  v_r := case when v_need then req_reason(p_reason) else nullif(trim(coalesce(p_reason, '')), '') end;
  perform set_config('app.change_reason', coalesce(v_r, ''), true);
  update training_requests set
    plan_year = case when p_patch ? 'plan_year' then (p_patch->>'plan_year')::smallint else plan_year end,
    request_date = case when p_patch ? 'request_date' then nullif(p_patch->>'request_date','')::date else request_date end,
    department_id = case when p_patch ? 'department_id' then nullif(p_patch->>'department_id','')::bigint else department_id end,
    unit_id = case when p_patch ? 'unit_id' then nullif(p_patch->>'unit_id','')::bigint else unit_id end,
    requester_id = case when p_patch ? 'requester_id' then nullif(p_patch->>'requester_id','')::uuid else requester_id end,
    requester_raw = case when p_patch ? 'requester_raw' then nullif(trim(coalesce(p_patch->>'requester_raw','')), '') else requester_raw end,
    topic = case when p_patch ? 'topic' then trim(p_patch->>'topic') else topic end,
    direction = case when p_patch ? 'direction' then nullif(trim(coalesce(p_patch->>'direction','')), '') else direction end,
    goal = case when p_patch ? 'goal' then nullif(trim(coalesce(p_patch->>'goal','')), '') else goal end,
    participants_planned = case when p_patch ? 'participants_planned' then nullif(p_patch->>'participants_planned','')::integer else participants_planned end,
    format = case when p_patch ? 'format' then nullif(p_patch->>'format','')::training_format else format end,
    kind = case when p_patch ? 'kind' then (p_patch->>'kind')::training_kind else kind end,
    trainer_raw = case when p_patch ? 'trainer_raw' then nullif(trim(coalesce(p_patch->>'trainer_raw','')), '') else trainer_raw end,
    -- сумма меняется, валюта остаётся прежней (историческая USD остаётся USD); новой сумме без валюты ставится TJS
    budget_amount = case when p_patch ? 'budget_amount' then nullif(p_patch->>'budget_amount','')::numeric else budget_amount end,
    budget_currency = case when p_patch ? 'budget_amount' and nullif(p_patch->>'budget_amount','') is not null
                           then coalesce(budget_currency, 'TJS'::currency_code)
                           when p_patch ? 'budget_amount' then null else budget_currency end,
    period_raw = case when p_patch ? 'period_raw' then nullif(trim(coalesce(p_patch->>'period_raw','')), '') else period_raw end,
    status = case when p_patch ? 'status' then (p_patch->>'status')::request_status else status end,
    comment = case when p_patch ? 'comment' then nullif(trim(coalesce(p_patch->>'comment','')), '') else comment end,
    carry_forward = case when p_patch ? 'carry_forward' then (p_patch->>'carry_forward')::boolean else carry_forward end,
    planned_year = case when p_patch ? 'planned_year' then nullif(p_patch->>'planned_year','')::smallint else planned_year end
  where id = p_id;
end $$;

create function set_request_archived(p_id uuid, p_archived boolean, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_r text := req_reason(p_reason);
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  perform set_config('app.change_reason', v_r, true);
  if p_archived then
    if exists (select 1 from trainings where request_id = p_id and archived_at is null) then
      raise exception 'К заявке привязан тренинг: сначала отвяжите его' using errcode = 'P0005';
    end if;
    update training_requests set archived_at = now(), archived_by = auth.uid(), archive_reason = v_r
     where id = p_id and archived_at is null;
  else
    update training_requests set archived_at = null, archived_by = null, archive_reason = null
     where id = p_id and archived_at is not null;
  end if;
  if not found then raise exception 'Заявка не найдена или уже в нужном состоянии' using errcode = 'P0015'; end if;
end $$;

-- ---------- Посещаемость: режим ----------
-- Переводит тренинг в режим посещаемости, сохраняя прежние часы участников:
-- участник с заходом — только на нём, без захода — на всех заходах.
create function ensure_attendance_mode(p_training uuid) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if has_attendance(p_training)
     or not exists (select 1 from training_participants where training_id = p_training)
     or not exists (select 1 from training_sessions where training_id = p_training) then
    return;
  end if;
  insert into session_attendance(participant_id, session_id, status)
  select p.id, s.id, 'PRESENT'
    from training_participants p
    join training_sessions s on s.training_id = p.training_id
   where p.training_id = p_training and p.attended and (p.session_id is null or p.session_id = s.id)
  on conflict do nothing;
end $$;

-- ---------- Заходы ----------
create function upsert_session(p_training uuid, p_session uuid, p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare t trainings%rowtype; s training_sessions%rowtype; v_id uuid; v_r text;
        v_start date; v_end date; v_hours numeric; v_no smallint;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into t from trainings where id = p_training for update;
  if not found then raise exception 'Тренинг не найден' using errcode = 'P0015'; end if;
  if t.archived_at is not null then raise exception 'Тренинг в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  if p_session is null then
    v_start := nullif(p->>'start_date','')::date; v_end := coalesce(nullif(p->>'end_date','')::date, v_start);
    v_hours := nullif(p->>'hours','')::numeric;
    if v_start is null or v_hours is null or v_hours <= 0 or v_end < v_start then
      raise exception 'Укажите даты захода (окончание не раньше начала) и часы больше 0' using errcode = 'P0015';
    end if;
    v_r := nullif(trim(coalesce(p_reason, '')), '');
    perform set_config('app.change_reason', coalesce(v_r, 'Добавлен заход'), true);
    select coalesce(max(session_no), 0) + 1 into v_no from training_sessions where training_id = p_training;
    insert into training_sessions(training_id, session_no, start_date, end_date, hours, location, comment)
    values (p_training, v_no, v_start, v_end, v_hours, nullif(trim(coalesce(p->>'location','')), ''),
            nullif(trim(coalesce(p->>'comment','')), ''))
    returning id into v_id;
    -- новый заход: участники по умолчанию присутствуют на нём
    if has_attendance(p_training) then
      insert into session_attendance(participant_id, session_id, status)
      select pp.id, v_id, 'PRESENT' from training_participants pp where pp.training_id = p_training and pp.attended
      on conflict do nothing;
    else
      perform ensure_attendance_mode(p_training);
    end if;
    return v_id;
  end if;
  select * into s from training_sessions where id = p_session and training_id = p_training for update;
  if not found then raise exception 'Заход не найден' using errcode = 'P0015'; end if;
  v_start := case when p ? 'start_date' then (p->>'start_date')::date else s.start_date end;
  v_end := case when p ? 'end_date' then (p->>'end_date')::date else s.end_date end;
  v_hours := case when p ? 'hours' then (p->>'hours')::numeric else s.hours end;
  if v_end < v_start or v_hours <= 0 then
    raise exception 'Окончание не раньше начала, часы больше 0' using errcode = 'P0015'; end if;
  if (v_start, v_end, v_hours) is distinct from (s.start_date, s.end_date, s.hours) then
    v_r := req_reason(p_reason);
  else
    v_r := nullif(trim(coalesce(p_reason, '')), '');
  end if;
  perform set_config('app.change_reason', coalesce(v_r, ''), true);
  update training_sessions set start_date = v_start, end_date = v_end, hours = v_hours,
    location = case when p ? 'location' then nullif(trim(coalesce(p->>'location','')), '') else location end,
    comment = case when p ? 'comment' then nullif(trim(coalesce(p->>'comment','')), '') else comment end
   where id = p_session;
  return p_session;
end $$;

create function delete_session(p_session uuid, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare s training_sessions%rowtype; v_r text := req_reason(p_reason); v_present uuid[]; v_last boolean;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select * into s from training_sessions where id = p_session for update;
  if not found then raise exception 'Заход не найден' using errcode = 'P0015'; end if;
  if exists (select 1 from trainings where id = s.training_id and archived_at is not null) then
    raise exception 'Тренинг в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  perform set_config('app.change_reason', v_r, true);
  v_last := (select count(*) from training_sessions where training_id = s.training_id) = 1;
  select coalesce(array_agg(a.participant_id), '{}') into v_present
    from session_attendance a where a.session_id = p_session and a.status = 'PRESENT';
  update training_participants set session_id = null where session_id = p_session;
  delete from training_sessions where id = p_session;
  -- последний заход удалён: возвращаемся к режиму без посещаемости, присутствовавшие остаются участниками
  if v_last and array_length(v_present, 1) > 0 then
    update training_participants set attended = true where id = any (v_present);
  end if;
end $$;

-- ---------- Участники ----------
create function add_participants(p_training uuid, p_employees uuid[], p_reason text default null) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare v_n integer := 0; v_ids uuid[]; v_has_sessions boolean;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if not exists (select 1 from trainings where id = p_training) then
    raise exception 'Тренинг не найден' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Добавление участников'), true);
  v_has_sessions := exists (select 1 from training_sessions where training_id = p_training);
  if v_has_sessions then perform ensure_attendance_mode(p_training); end if;
  with ins as (
    insert into training_participants(training_id, employee_id)
    select p_training, e.id from employees e
     where e.id = any (p_employees) and e.is_active
    on conflict (training_id, employee_id) do nothing
    returning id
  ) select coalesce(array_agg(id), '{}') into v_ids from ins;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_has_sessions and v_n > 0 then
    insert into session_attendance(participant_id, session_id, status)
    select pid, s.id, 'PRESENT' from unnest(v_ids) pid
      cross join training_sessions s where s.training_id = p_training;
  end if;
  return v_n;
end $$;

-- Добавить всех активных сотрудников подразделения (департамент включает его отделы)
create function add_participants_by_unit(p_training uuid, p_org_unit bigint, p_reason text default null) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare v_ids uuid[];
begin
  select coalesce(array_agg(e.id), '{}') into v_ids from employees e
   where e.is_active and (e.unit_id = p_org_unit or e.department_id = p_org_unit
         or e.unit_id in (select id from org_units where parent_id = p_org_unit));
  return add_participants(p_training, v_ids,
    coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Добавление участников по подразделению'));
end $$;

create function remove_participant(p_participant uuid, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_r text := req_reason(p_reason); v_t uuid;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  select training_id into v_t from training_participants where id = p_participant;
  if v_t is null then raise exception 'Участник не найден' using errcode = 'P0015'; end if;
  if exists (select 1 from trainings where id = v_t and archived_at is not null) then
    raise exception 'Тренинг в архиве: изменение запрещено' using errcode = 'P0005'; end if;
  perform set_config('app.change_reason', v_r, true);
  delete from training_participants where id = p_participant;
end $$;

-- p_updates: [{"participant_id": "...", "session_id": "...", "status": "PRESENT|ABSENT|EXCUSED"}, ...]
create function set_attendance(p_updates jsonb, p_reason text) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare v_r text := req_reason(p_reason); u jsonb; v_t uuid; v_seen uuid[] := '{}'; v_n integer := 0;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) = 0 then
    raise exception 'Нет данных посещаемости' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', v_r, true);
  for u in select * from jsonb_array_elements(p_updates) loop
    select training_id into v_t from training_participants where id = (u->>'participant_id')::uuid;
    if v_t is null then raise exception 'Участник не найден' using errcode = 'P0015'; end if;
    if exists (select 1 from trainings where id = v_t and archived_at is not null) then
      raise exception 'Тренинг в архиве: изменение запрещено' using errcode = 'P0005'; end if;
    if not (v_t = any (v_seen)) then perform ensure_attendance_mode(v_t); v_seen := v_seen || v_t; end if;
    insert into session_attendance(participant_id, session_id, status)
    values ((u->>'participant_id')::uuid, (u->>'session_id')::uuid, (u->>'status')::attendance_status)
    on conflict (participant_id, session_id) do update set status = excluded.status
      where session_attendance.status is distinct from excluded.status;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ---------- Расходы ----------
create function add_expense(p_training uuid, p_category smallint, p_amount numeric, p_currency currency_code,
                            p_date date, p_comment text, p_reason text) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_r text := req_reason(p_reason);
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]);
  if p_amount is null or p_amount < 0 then raise exception 'Сумма расхода должна быть не меньше 0' using errcode = 'P0015'; end if;
  if p_date is null then raise exception 'Укажите дату операции' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', v_r, true);
  insert into expense_operations(training_id, category_id, amount, currency, operation_date, comment)
  values (p_training, p_category, p_amount, coalesce(p_currency, 'TJS'), p_date, nullif(trim(coalesce(p_comment,'')), ''))
  returning id into v_id;
  return v_id;
end $$;

create function update_expense(p_id uuid, p_patch jsonb, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_r text := req_reason(p_reason); k text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]);
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('category_id','amount','currency','operation_date','comment') then
      raise exception 'Поле «%» нельзя менять', k using errcode = 'P0015'; end if;
  end loop;
  if p_patch ? 'amount' and (p_patch->>'amount')::numeric < 0 then
    raise exception 'Сумма расхода должна быть не меньше 0' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', v_r, true);
  update expense_operations set
    category_id = case when p_patch ? 'category_id' then (p_patch->>'category_id')::smallint else category_id end,
    amount = case when p_patch ? 'amount' then (p_patch->>'amount')::numeric else amount end,
    currency = case when p_patch ? 'currency' then (p_patch->>'currency')::currency_code else currency end,
    operation_date = case when p_patch ? 'operation_date' then (p_patch->>'operation_date')::date else operation_date end,
    comment = case when p_patch ? 'comment' then nullif(trim(coalesce(p_patch->>'comment','')), '') else comment end
   where id = p_id;
  if not found then raise exception 'Операция не найдена' using errcode = 'P0015'; end if;
end $$;

-- ---------- Сотрудники (справочник) ----------
create function create_employee(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_name text := trim(coalesce(p->>'full_name', ''));
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if v_name = '' then raise exception 'Укажите ФИО' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создание сотрудника'), true);
  insert into employees(canonical_id, full_name, name_norm, department_id, unit_id, "position")
  values (next_employee_code(), v_name, norm_name(v_name), nullif(p->>'department_id','')::bigint,
          nullif(p->>'unit_id','')::bigint, nullif(trim(coalesce(p->>'position','')), ''))
  returning id into v_id;
  return v_id;
end $$;

create function update_employee(p_id uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare k text; v_r text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('full_name','department_id','unit_id','position','is_active') then
      raise exception 'Поле «%» нельзя менять', k using errcode = 'P0015'; end if;
  end loop;
  if p_patch ? 'full_name' and length(trim(coalesce(p_patch->>'full_name',''))) = 0 then
    raise exception 'ФИО не может быть пустым' using errcode = 'P0015'; end if;
  v_r := case when p_patch ? 'is_active' then req_reason(p_reason) else nullif(trim(coalesce(p_reason,'')), '') end;
  perform set_config('app.change_reason', coalesce(v_r, ''), true);
  update employees set
    full_name = case when p_patch ? 'full_name' then trim(p_patch->>'full_name') else full_name end,
    name_norm = case when p_patch ? 'full_name' then norm_name(p_patch->>'full_name') else name_norm end,
    department_id = case when p_patch ? 'department_id' then nullif(p_patch->>'department_id','')::bigint else department_id end,
    unit_id = case when p_patch ? 'unit_id' then nullif(p_patch->>'unit_id','')::bigint else unit_id end,
    "position" = case when p_patch ? 'position' then nullif(trim(coalesce(p_patch->>'position','')), '') else "position" end,
    is_active = case when p_patch ? 'is_active' then (p_patch->>'is_active')::boolean else is_active end,
    updated_at = now()
   where id = p_id;
  if not found then raise exception 'Сотрудник не найден' using errcode = 'P0015'; end if;
end $$;

-- Подтверждённое соответствие: «такое написание = этот сотрудник». Слияния сотрудников нет.
create function add_employee_alias(p_employee uuid, p_alias text, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_r text := req_reason(p_reason); v_norm text := norm_name(p_alias); v_other uuid;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if v_norm = '' then raise exception 'Укажите написание' using errcode = 'P0015'; end if;
  select employee_id into v_other from employee_aliases where alias_norm = v_norm;
  if v_other is not null then
    raise exception 'Это написание уже закреплено за другим сотрудником' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', v_r, true);
  insert into employee_aliases(employee_id, alias_norm, confidence, confirmed_by)
  values (p_employee, v_norm, 100, auth.uid());
end $$;

create function remove_employee_alias(p_alias bigint, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_r text := req_reason(p_reason);
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  perform set_config('app.change_reason', v_r, true);
  delete from employee_aliases where id = p_alias;
  if not found then raise exception 'Написание не найдено' using errcode = 'P0015'; end if;
end $$;

-- ---------- Откат изменения (↶) ----------
-- Откатывает одну запись аудита. Если поле позже изменено ещё раз — откат запрещён (P0014).
-- Расходы откатываются только через сторно (void_expense). Откат сам попадает в аудит.
create function revert_change(p_audit_id bigint, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare a audit_log%rowtype; v_r text := req_reason(p_reason); v_tbl text; v_roles app_role[];
        v_row jsonb; v_cur jsonb; v_where text; k text; v_keys text[] := '{}'; v_tid uuid; v_note text;
        v_ignore text[] := array['updated_at','updated_by','created_at','created_by','marked_at','marked_by','added_at','added_by','id'];
begin
  select * into a from audit_log where id = p_audit_id;
  if not found then raise exception 'Запись аудита не найдена' using errcode = 'P0015'; end if;
  v_tbl := a.table_name;
  v_roles := case when v_tbl in ('trainings','training_sessions','training_requests') then '{ADMIN,ACADEMY_MANAGER}'::app_role[]
                  when v_tbl in ('training_participants','session_attendance') then '{ADMIN,ACADEMY_MANAGER,HR}'::app_role[] end;
  if v_roles is null then
    raise exception 'Откат для «%» не поддерживается (расходы — через сторно)', v_tbl using errcode = 'P0015'; end if;
  perform req_role(v_roles);
  v_row := coalesce(a.new_row, a.old_row);
  v_tid := case v_tbl when 'trainings' then (v_row->>'id')::uuid
                      when 'training_sessions' then (v_row->>'training_id')::uuid
                      when 'training_participants' then (v_row->>'training_id')::uuid
                      when 'session_attendance' then coalesce(
                         (select training_id from training_participants where id = (v_row->>'participant_id')::uuid),
                         (select training_id from training_sessions where id = (v_row->>'session_id')::uuid)) end;
  if v_tbl <> 'training_requests' and v_tid is not null
     and exists (select 1 from trainings where id = v_tid and archived_at is not null)
     and not (v_tbl = 'trainings' and a.action = 'UPDATE' and (a.old_row->>'archived_at') is null) then
    -- архивный тренинг: откат допустим только для самого действия архивации
    raise exception 'Тренинг в архиве: изменение запрещено' using errcode = 'P0005';
  end if;
  v_note := 'Откат изменения #' || a.id || ': ' || v_r;
  perform set_config('app.change_reason', v_note, true);
  perform set_config('app.confirmed', 'yes', true);

  v_where := case when v_tbl = 'session_attendance'
                  then format('participant_id = %L and session_id = %L', v_row->>'participant_id', v_row->>'session_id')
                  else format('id = %L', v_row->>'id') end;
  execute format('select to_jsonb(t) from %I t where %s', v_tbl, v_where) into v_cur;

  if a.action = 'UPDATE' then
    if v_cur is null then raise exception 'Запись уже удалена: откат невозможен' using errcode = 'P0014'; end if;
    for k in select jsonb_object_keys(a.new_row) loop
      if a.old_row->k is distinct from a.new_row->k and not (k = any (v_ignore)) then
        if v_cur->k is distinct from a.new_row->k then
          raise exception 'Поле «%» изменено позже: откат невозможен', k using errcode = 'P0014'; end if;
        v_keys := v_keys || k;
      end if;
    end loop;
    if array_length(v_keys, 1) is null then raise exception 'В этой записи нет изменений для отката' using errcode = 'P0015'; end if;
    if v_tbl = 'trainings' and exists (select 1 from training_sessions where training_id = (v_row->>'id')::uuid)
       and v_keys && array['hours','start_date','end_date'] then
      raise exception 'Часы и даты тренинга считаются по заходам: откатите заход' using errcode = 'P0013'; end if;
    execute format('update %1$I set (%2$s) = (select %2$s from jsonb_populate_record(null::%1$I, $1)) where %3$s',
                   v_tbl, (select string_agg(format('%I', c), ', ') from unnest(v_keys) c), v_where) using a.old_row;
  elsif a.action = 'INSERT' then
    if v_cur is null then raise exception 'Запись уже удалена: откат невозможен' using errcode = 'P0014'; end if;
    case v_tbl
      when 'trainings' then
        update trainings set archived_at = now(), archived_by = auth.uid(), archive_reason = v_note where id = (v_row->>'id')::uuid;
      when 'training_requests' then
        update training_requests set archived_at = now(), archived_by = auth.uid(), archive_reason = v_note where id = (v_row->>'id')::uuid;
      when 'training_sessions' then perform delete_session((v_row->>'id')::uuid, v_note);
      when 'training_participants' then delete from training_participants where id = (v_row->>'id')::uuid;
      when 'session_attendance' then
        delete from session_attendance where participant_id = (v_row->>'participant_id')::uuid and session_id = (v_row->>'session_id')::uuid;
    end case;
  else  -- DELETE: вернуть запись
    if v_cur is not null then raise exception 'Запись уже существует' using errcode = 'P0014'; end if;
    if v_tbl in ('trainings','training_requests') then
      raise exception 'Откат удаления для «%» не поддерживается', v_tbl using errcode = 'P0015'; end if;
    if v_tbl = 'training_participants' and a.old_row->>'session_id' is not null
       and not exists (select 1 from training_sessions where id = (a.old_row->>'session_id')::uuid) then
      a.old_row := jsonb_set(a.old_row, '{session_id}', 'null'::jsonb);
    end if;
    execute format('insert into %1$I select * from jsonb_populate_record(null::%1$I, $1)', v_tbl) using a.old_row;
    -- вместе с участником возвращаем его отметки посещаемости, удалённые в той же операции
    if v_tbl = 'training_participants' then
      insert into session_attendance(participant_id, session_id, status)
      select (r->>'participant_id')::uuid, (r->>'session_id')::uuid, (r->>'status')::attendance_status
        from (select old_row r from audit_log
               where table_name = 'session_attendance' and action = 'DELETE' and at = a.at
                 and old_row->>'participant_id' = a.row_id) x
       where exists (select 1 from training_sessions s where s.id = (r->>'session_id')::uuid)
      on conflict do nothing;
    end if;
  end if;
end $$;

-- ---------- Права на выполнение ----------
do $$ declare f text; begin
  foreach f in array array[
    'norm_name(text)','next_request_code(integer)','next_employee_code()',
    'create_training(jsonb,text)','update_training(uuid,jsonb,text)',
    'link_request(uuid,uuid,source_type,boolean,text)','set_training_archived(uuid,boolean,text)',
    'create_request(jsonb,text)','update_request(uuid,jsonb,text)','set_request_archived(uuid,boolean,text)',
    'ensure_attendance_mode(uuid)','upsert_session(uuid,uuid,jsonb,text)','delete_session(uuid,text)',
    'add_participants(uuid,uuid[],text)','add_participants_by_unit(uuid,bigint,text)','remove_participant(uuid,text)',
    'set_attendance(jsonb,text)','add_expense(uuid,smallint,numeric,currency_code,date,text,text)',
    'update_expense(uuid,jsonb,text)','create_employee(jsonb,text)','update_employee(uuid,jsonb,text)',
    'add_employee_alias(uuid,text,text)','remove_employee_alias(bigint,text)','revert_change(bigint,text)']
  loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------- Представления для интерфейса ----------
-- Список тренингов с расчётами из БД (интерфейс ничего не считает). Финансы: NULL без доступа (actual_total).
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
