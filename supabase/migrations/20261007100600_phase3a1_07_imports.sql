-- Phase 3A.1 · M20: Import Center. Общий конвейер: STAGE (предпросмотр + dry run) → RESOLVE (решения по спорным строкам) → COMMIT (одна транзакция) → AUDIT.
-- Он же основа Phase 3B (Google Sheets): источник строк не важен — сервер превращает файл/таблицу в массив строк.
-- Сотрудники из участников автоматически не создаются: нет совпадения → строка требует решения человека.

create table import_jobs (
  id uuid primary key default gen_random_uuid(),
  entity text not null check (entity in ('EMPLOYEES','PARTICIPANTS','LEARNING_EVENTS','EXPENSES','EXAMS','CERTIFICATES')),
  source text not null check (source in ('XLSX','CSV','PASTE','GSHEET')),
  file_name text not null,
  file_hash text,
  status text not null default 'STAGED' check (status in ('STAGED','COMMITTED','CANCELLED','FAILED')),
  mapping jsonb not null default '{}'::jsonb,
  options jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0,
  new_rows integer not null default 0,
  updated_rows integer not null default 0,
  unchanged_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  review_rows integer not null default 0,
  error_rows integer not null default 0,
  inserted integer not null default 0,
  updated integer not null default 0,
  skipped integer not null default 0,
  conflicts integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  committed_at timestamptz,
  committed_by uuid references profiles(id)
);
create index import_jobs_created_by_idx on import_jobs (created_by);
create index import_jobs_committed_by_idx on import_jobs (committed_by);
create index import_jobs_status_idx on import_jobs (status, created_at desc);

create table import_job_rows (
  id bigint generated always as identity primary key,
  job_id uuid not null references import_jobs(id),
  row_no integer not null,
  raw jsonb not null,
  data jsonb not null default '{}'::jsonb,
  status text not null check (status in ('NEW','UPDATED','UNCHANGED','DUPLICATE','NEEDS_REVIEW','ERROR')),
  match_id uuid,
  candidates jsonb,
  messages text[] not null default '{}',
  review_code text,
  decision text check (decision in ('APPLY','SKIP','MATCH')),
  decision_match uuid,
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  applied_id uuid,
  unique (job_id, row_no)
);
create index import_job_rows_status_idx on import_job_rows (job_id, status);
create index import_job_rows_decided_by_idx on import_job_rows (decided_by);

create function can_import(p_entity text) returns boolean language sql stable set search_path = public, pg_temp as $$
  select coalesce(app_role() = any (case p_entity
      when 'LEARNING_EVENTS' then '{ADMIN,ACADEMY_MANAGER}'::app_role[]
      when 'EXPENSES' then '{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]
      else '{ADMIN,ACADEMY_MANAGER,HR}'::app_role[] end), false)
$$;
alter table import_jobs enable row level security;
alter table import_job_rows enable row level security;
create policy import_jobs_all on import_jobs for all to authenticated using (can_import(entity)) with check (can_import(entity));
create policy import_rows_all on import_job_rows for all to authenticated
  using (exists (select 1 from import_jobs j where j.id = job_id and can_import(j.entity)))
  with check (exists (select 1 from import_jobs j where j.id = job_id and can_import(j.entity)));
create trigger audit_import_jobs after insert or update or delete on import_jobs for each row execute function trg_audit();

-- ---------- Вспомогательное ----------
create function parse_date_text(p text) returns date language plpgsql immutable set search_path = public, pg_temp as $$
declare t text := trim(coalesce(p, ''));
begin
  if t = '' then return null; end if;
  if t ~ '^\d{4}-\d{2}-\d{2}' then return substring(t from 1 for 10)::date; end if;
  if t ~ '^\d{1,2}[./]\d{1,2}[./]\d{4}$' then
    return make_date(split_part(replace(t, '/', '.'), '.', 3)::int, split_part(replace(t, '/', '.'), '.', 2)::int, split_part(replace(t, '/', '.'), '.', 1)::int);
  end if;
  raise exception 'Неверная дата: %', t;
end $$;

-- подразделение по названию (с псевдонимами); уровень — DEPARTMENT/UNIT; возвращает все совпадения
create function find_org_units(p_name text, p_level org_level, p_parent bigint default null) returns bigint[]
language sql stable set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct u.id), '{}')
    from org_units u
   where u.level = p_level and u.is_active and (p_parent is null or u.parent_id = p_parent)
     and (norm_name(u.name) = norm_name(p_name)
          or exists (select 1 from org_unit_aliases a where a.org_unit_id = u.id and a.alias_norm = norm_name(p_name)))
$$;

create function import_bool(p text) returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case when lower(trim(coalesce(p,''))) in ('1','true','да','yes','y','активен','активный','работает','active') then true
              when lower(trim(coalesce(p,''))) in ('0','false','нет','no','n','уволен','неактивен','inactive','не работает') then false end
$$;

-- ---------- Анализ строки (dry run): ничего не пишет ----------
create function import_analyze_row(p_entity text, p_in jsonb, p_options jsonb) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare msgs text[] := '{}'; st text := 'NEW'; code text; match uuid; cands jsonb := '[]'::jsonb; d jsonb := '{}'::jsonb;
        v_name text := trim(coalesce(p_in->>'full_name', p_in->>'employee', ''));
        v_code text := nullif(trim(coalesce(p_in->>'employee_code', p_in->>'code', '')), '');
        e employees%rowtype; n integer; best text; ids bigint[]; v_dept bigint; v_unit bigint; v_date date; v_tr trainings%rowtype; x record;
begin
  if p_entity in ('EMPLOYEES','PARTICIPANTS','EXAMS','CERTIFICATES') then
    if v_name = '' and v_code is null then return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Не указан сотрудник (ФИО или табельный номер)'),'data','{}'::jsonb); end if;
    -- сопоставление сотрудника
    select coalesce(jsonb_agg(jsonb_build_object('employee_id', employee_id, 'full_name', full_name, 'match_kind', match_kind,
              'position', "position", 'is_active', is_active)), '[]'::jsonb),
           (array_agg(match_kind order by case match_kind when 'CODE' then 1 when 'EXACT' then 2 when 'ALIAS' then 3 when 'REORDERED' then 4 else 5 end))[1]
      into cands, best from match_employee_candidates(v_name, v_code, p_entity <> 'EMPLOYEES');
    select count(*) into n from jsonb_array_elements(cands) c where c->>'match_kind' = best;
    if best in ('CODE','EXACT','ALIAS') and n = 1 then
      match := (select (c->>'employee_id')::uuid from jsonb_array_elements(cands) c where c->>'match_kind' = best limit 1);
      st := 'UPDATED';
    elsif jsonb_array_length(cands) = 0 then
      if p_entity = 'EMPLOYEES' then st := 'NEW';
      else st := 'NEEDS_REVIEW'; code := 'EMPLOYEE_NOT_FOUND'; msgs := msgs || 'Сотрудник не найден в справочнике'; end if;
    else
      st := 'NEEDS_REVIEW'; code := case when best in ('CODE','EXACT','ALIAS') then 'EMPLOYEE_AMBIGUOUS' else 'EMPLOYEE_FUZZY' end;
      msgs := msgs || (case when n > 1 then 'Найдено несколько сотрудников' else 'Совпадение неточное: проверьте сотрудника' end);
    end if;
  end if;

  if p_entity = 'EMPLOYEES' then
    d := jsonb_build_object('full_name', v_name, 'employee_code', v_code);
    if v_name = '' then return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Не указано ФИО'),'data',d); end if;
    begin
      if nullif(trim(p_in->>'hire_date'), '') is not null then d := d || jsonb_build_object('hire_date', parse_date_text(p_in->>'hire_date')); end if;
      if nullif(trim(p_in->>'termination_date'), '') is not null then d := d || jsonb_build_object('termination_date', parse_date_text(p_in->>'termination_date')); end if;
    exception when others then return jsonb_build_object('status','ERROR','messages',jsonb_build_array(sqlerrm),'data',d); end;
    if nullif(trim(p_in->>'position'), '') is not null then d := d || jsonb_build_object('position', trim(p_in->>'position')); end if;
    if nullif(trim(p_in->>'email'), '') is not null then d := d || jsonb_build_object('email', lower(trim(p_in->>'email'))); end if;
    if nullif(trim(p_in->>'phone'), '') is not null then d := d || jsonb_build_object('phone', trim(p_in->>'phone')); end if;
    if import_bool(p_in->>'status') is not null then d := d || jsonb_build_object('is_active', import_bool(p_in->>'status')); end if;
    if nullif(trim(p_in->>'department'), '') is not null then
      ids := find_org_units(p_in->>'department', 'DEPARTMENT');
      if array_length(ids, 1) = 1 then v_dept := ids[1]; d := d || jsonb_build_object('department_id', v_dept);
      else msgs := msgs || ('Подразделение «' || (p_in->>'department') || '» ' || (case when coalesce(array_length(ids,1),0) = 0 then 'не найдено' else 'неоднозначно' end));
           if st <> 'NEEDS_REVIEW' then st := 'NEEDS_REVIEW'; code := 'UNIT_UNKNOWN'; end if; end if;
    end if;
    if nullif(trim(p_in->>'unit'), '') is not null then
      ids := find_org_units(p_in->>'unit', 'UNIT', v_dept);
      if array_length(ids, 1) = 1 then v_unit := ids[1]; d := d || jsonb_build_object('unit_id', v_unit);
        if v_dept is null then d := d || jsonb_build_object('department_id', (select parent_id from org_units where id = v_unit)); end if;
      else msgs := msgs || ('Отдел «' || (p_in->>'unit') || '» ' || (case when coalesce(array_length(ids,1),0) = 0 then 'не найден' else 'неоднозначен' end));
           if st <> 'NEEDS_REVIEW' then st := 'NEEDS_REVIEW'; code := 'UNIT_UNKNOWN'; end if; end if;
    end if;
    if v_code is not null and exists (select 1 from employees where lower(employee_code) = lower(v_code) and id is distinct from match) then
      return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Табельный номер ' || v_code || ' уже принадлежит другому сотруднику'),'data',d);
    end if;
    if match is not null and st = 'UPDATED' then
      select * into e from employees where id = match;
      select email, phone into x from employee_contacts where employee_id = match;
      if (d->>'full_name') is not distinct from e.full_name
         and (not d ? 'employee_code' or d->>'employee_code' is null or d->>'employee_code' is not distinct from e.employee_code)
         and (not d ? 'position' or d->>'position' is not distinct from e."position")
         and (not d ? 'department_id' or (d->>'department_id')::bigint is not distinct from e.department_id)
         and (not d ? 'unit_id' or (d->>'unit_id')::bigint is not distinct from e.unit_id)
         and (not d ? 'hire_date' or (d->>'hire_date')::date is not distinct from e.hire_date)
         and (not d ? 'termination_date' or (d->>'termination_date')::date is not distinct from e.termination_date)
         and (not d ? 'is_active' or (d->>'is_active')::boolean is not distinct from e.is_active)
         and (not d ? 'email' or d->>'email' is not distinct from x.email)
         and (not d ? 'phone' or d->>'phone' is not distinct from x.phone) then st := 'UNCHANGED'; end if;
    end if;

  elsif p_entity = 'PARTICIPANTS' then
    select * into v_tr from trainings where id = nullif(p_options->>'training_id','')::uuid;
    if not found then return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Не выбрано мероприятие'),'data','{}'::jsonb); end if;
    d := jsonb_build_object('full_name', v_name, 'employee_code', v_code, 'note', nullif(trim(coalesce(p_in->>'note','')), ''));
    if match is not null and exists (select 1 from training_participants where training_id = v_tr.id and employee_id = match) then
      st := 'UNCHANGED'; msgs := msgs || 'Уже участник';
    elsif match is not null then st := 'NEW'; end if;

  elsif p_entity = 'EXAMS' then
    declare v_skill smallint; v_res text := upper(trim(coalesce(p_in->>'result','')));
    begin
      select id into v_skill from skills where name_norm = norm_name(p_in->>'qualification') and kind in ('QUALIFICATION','CERTIFICATION') and is_active limit 1;
      v_date := parse_date_text(p_in->>'exam_date');
      if v_date is null then return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Не указана дата экзамена'),'data',d); end if;
      v_res := case v_res when 'СДАН' then 'PASSED' when 'НЕ СДАН' then 'FAILED' when 'НЕ ЯВИЛСЯ' then 'NOT_ATTENDED' when '' then 'PENDING' else v_res end;
      if v_res not in ('PENDING','PASSED','FAILED','NOT_ATTENDED','OTHER') then
        return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Недопустимый результат: ' || v_res),'data',d); end if;
      d := jsonb_build_object('full_name', v_name, 'qualification', trim(p_in->>'qualification'), 'skill_id', v_skill, 'exam_date', v_date,
                              'result', v_res, 'score', nullif(trim(coalesce(p_in->>'score','')), ''),
                              'fee', nullif(trim(coalesce(p_in->>'fee','')), ''), 'currency', upper(nullif(trim(coalesce(p_in->>'currency','')), '')),
                              'funding_source', upper(nullif(trim(coalesce(p_in->>'funding_source','')), '')));
      if length(trim(coalesce(p_in->>'qualification',''))) = 0 then return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Не указана квалификация'),'data',d); end if;
      if v_skill is null then msgs := msgs || ('Квалификация «' || (p_in->>'qualification') || '» не найдена: будет создана при применении');
         if st <> 'NEEDS_REVIEW' then st := 'NEEDS_REVIEW'; code := 'SKILL_UNKNOWN'; end if; end if;
      if match is not null and v_skill is not null and exists (select 1 from exams where employee_id = match and skill_id = v_skill and exam_date = v_date and archived_at is null) then
        st := 'UNCHANGED'; msgs := msgs || 'Экзамен на эту дату уже есть';
      elsif match is not null and st = 'UPDATED' then st := 'NEW'; end if;
    exception when others then return jsonb_build_object('status','ERROR','messages',jsonb_build_array(sqlerrm),'data',d); end;

  elsif p_entity = 'CERTIFICATES' then
    begin
      d := jsonb_build_object('full_name', v_name, 'name', trim(coalesce(p_in->>'name','')), 'cert_type', upper(nullif(trim(coalesce(p_in->>'cert_type','')), '')),
             'issuing_organization', nullif(trim(coalesce(p_in->>'issuing_organization','')), ''),
             'issue_date', parse_date_text(p_in->>'issue_date'), 'expiration_date', parse_date_text(p_in->>'expiration_date'),
             'certificate_number', nullif(trim(coalesce(p_in->>'certificate_number','')), ''));
    exception when others then return jsonb_build_object('status','ERROR','messages',jsonb_build_array(sqlerrm),'data',d); end;
    if d->>'name' = '' then return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Не указано название сертификата'),'data',d); end if;
    if match is not null and exists (select 1 from certificates c where c.employee_id = match and c.archived_at is null
         and ((d->>'certificate_number' is not null and c.certificate_number = d->>'certificate_number')
           or (d->>'certificate_number' is null and lower(c.name) = lower(d->>'name') and c.issue_date is not distinct from (d->>'issue_date')::date))) then
      st := 'UNCHANGED'; msgs := msgs || 'Такой сертификат уже есть';
    elsif match is not null then st := 'NEW'; end if;

  elsif p_entity = 'LEARNING_EVENTS' then
    declare v_type smallint; v_end date; v_hours numeric;
    begin
      v_date := parse_date_text(p_in->>'start_date'); v_end := coalesce(parse_date_text(p_in->>'end_date'), v_date);
      v_hours := nullif(replace(trim(coalesce(p_in->>'hours','')), ',', '.'), '')::numeric;
      select id into v_type from learning_event_types
       where is_active and (upper(code) = upper(trim(coalesce(p_in->>'type',''))) or norm_name(name) = norm_name(p_in->>'type')) limit 1;
      d := jsonb_build_object('title', trim(coalesce(p_in->>'title','')), 'event_type_id', v_type, 'start_date', v_date, 'end_date', v_end, 'hours', v_hours,
            'format', upper(nullif(trim(coalesce(p_in->>'format','')), '')), 'location', nullif(trim(coalesce(p_in->>'location','')), ''),
            'organizer', nullif(trim(coalesce(p_in->>'organizer','')), ''));
      if d->>'title' = '' or v_date is null or v_hours is null or v_hours <= 0 then
        return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Нужны название, дата начала и часы (> 0)'),'data',d); end if;
      if v_end < v_date then return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Дата окончания раньше даты начала'),'data',d); end if;
      if nullif(trim(coalesce(p_in->>'type','')), '') is not null and v_type is null then
        st := 'NEEDS_REVIEW'; code := 'TYPE_UNKNOWN'; msgs := msgs || ('Тип «' || (p_in->>'type') || '» не найден в справочнике'); end if;
      select id into match from trainings where norm_name(title) = norm_name(d->>'title') and start_date = v_date and archived_at is null limit 1;
      if match is not null then st := 'DUPLICATE'; msgs := msgs || 'Мероприятие с таким названием и датой уже есть'; end if;
    exception when others then return jsonb_build_object('status','ERROR','messages',jsonb_build_array(sqlerrm),'data',d); end;

  elsif p_entity = 'EXPENSES' then
    declare v_cat smallint; v_amt numeric; v_cur text := upper(coalesce(nullif(trim(coalesce(p_in->>'currency','')), ''), 'TJS'));
    begin
      select * into v_tr from trainings where canonical_id = trim(coalesce(p_in->>'training','')) and archived_at is null;
      if not found then return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Мероприятие не найдено по коду (TR-…)'),'data',d); end if;
      select id into v_cat from expense_categories where norm_name(name) = norm_name(p_in->>'category') limit 1;
      v_amt := replace(trim(coalesce(p_in->>'amount','')), ',', '.')::numeric; v_date := parse_date_text(p_in->>'date');
      if v_cat is null or v_amt is null or v_amt < 0 or v_date is null then
        return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Нужны статья расходов из справочника, сумма (≥ 0) и дата'),'data',d); end if;
      if v_cur not in ('TJS','USD','EUR','RUB','UZS','KZT') then return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Неизвестная валюта'),'data',d); end if;
      if v_cur <> 'TJS' and not exists (select 1 from fx_rates where currency = v_cur::currency_code and rate_date <= v_date) then
        return jsonb_build_object('status','ERROR','messages',jsonb_build_array('Нет курса ' || v_cur || ' на ' || v_date),'data',d); end if;
      d := jsonb_build_object('training_id', v_tr.id, 'category_id', v_cat, 'amount', v_amt, 'currency', v_cur, 'date', v_date, 'comment', nullif(trim(coalesce(p_in->>'comment','')), ''));
      if exists (select 1 from expense_operations o where o.training_id = v_tr.id and o.category_id = v_cat and o.amount = v_amt
                   and o.currency = v_cur::currency_code and o.operation_date = v_date and o.voided_at is null) then
        st := 'DUPLICATE'; msgs := msgs || 'Такой расход уже внесён'; end if;
    exception when others then return jsonb_build_object('status','ERROR','messages',jsonb_build_array(sqlerrm),'data',d); end;
  end if;
  return jsonb_build_object('status', st, 'match_id', match, 'candidates', cands, 'messages', to_jsonb(msgs), 'review_code', code, 'data', d);
end $$;

-- Записи Data Quality и lineage пишутся от имени системы (у HR нет прямых прав на dq_issues/source_files)
create function import_dq_sync(p_job uuid, p_row bigint, p_code text, p_message text, p_open boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_fp text := 'IMPORT|' || p_job || '|' || p_row;
begin
  if not exists (select 1 from import_jobs j where j.id = p_job and can_import(j.entity)) then
    raise exception 'Импорт не найден' using errcode = '42501'; end if;
  if p_open then
    insert into dq_issues(rule_code, severity, entity_table, entity_id, message, suggestion, details, fingerprint, source)
    values ('IMPORT_' || coalesce(p_code, 'REVIEW'), 'WARNING', 'import_jobs', p_job::text, p_message,
            'Откройте импорт и выберите: применить, сопоставить с сотрудником или пропустить.',
            jsonb_build_object('job_id', p_job, 'row_id', p_row), v_fp, 'IMPORT')
    on conflict (fingerprint) where fingerprint is not null do update set status = 'OPEN', message = excluded.message, updated_at = now();
  else
    update dq_issues set status = 'FIXED', resolved_at = now(), resolution = 'Решено в импорте', updated_at = now()
     where fingerprint = v_fp and status in ('OPEN','IN_REVIEW');
  end if;
end $$;

create function import_lineage(p_job uuid, p_row_no integer, p_hash text, p_table text, p_entity uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_file bigint; j import_jobs%rowtype;
begin
  select * into j from import_jobs where id = p_job;
  if not found or not can_import(j.entity) then raise exception 'Импорт не найден' using errcode = '42501'; end if;
  select id into v_file from source_files where system = 'IMPORT:' || j.entity and file_hash = p_job::text limit 1;
  if v_file is null then
    insert into source_files(system, file_name, file_hash, uploaded_by) values ('IMPORT:' || j.entity, j.file_name, p_job::text, auth.uid()) returning id into v_file;
  end if;
  insert into source_records(source_file_id, sheet, row_number, row_hash, entity_table, entity_id)
  values (v_file, 'import', p_row_no, p_hash, p_table, p_entity::text) on conflict (source_file_id, sheet, row_number) do nothing;
end $$;

-- ---------- Stage ----------
create function import_stage(p_entity text, p_source text, p_file_name text, p_file_hash text, p_mapping jsonb, p_options jsonb, p_rows jsonb)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_job uuid; r jsonb; a jsonb; v_id bigint; seen_codes text[] := '{}'; seen_names text[] := '{}'; v_key text; v_dup boolean;
begin
  if not can_import(p_entity) then raise exception 'Недостаточно прав для импорта «%»', p_entity using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'В файле нет строк' using errcode = 'P0015'; end if;
  if jsonb_array_length(p_rows) > 5000 then raise exception 'Не больше 5000 строк за раз' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', 'Импорт: ' || p_file_name, true);
  insert into import_jobs(entity, source, file_name, file_hash, mapping, options)
  values (p_entity, p_source, left(p_file_name, 200), p_file_hash, coalesce(p_mapping, '{}'), coalesce(p_options, '{}')) returning id into v_job;
  for r in select * from jsonb_array_elements(p_rows) loop
    a := import_analyze_row(p_entity, r->'data', coalesce(p_options, '{}'));
    -- дубли внутри файла
    v_key := case when p_entity in ('EMPLOYEES','PARTICIPANTS') then coalesce(nullif(lower(trim(r->'data'->>'employee_code')), ''), norm_name(r->'data'->>'full_name'))
                  when p_entity = 'EXPENSES' then md5((a->'data')::text)
                  else md5((a->'data')::text) end;
    v_dup := v_key = any (seen_names) and a->>'status' not in ('ERROR');
    seen_names := seen_names || v_key;
    insert into import_job_rows(job_id, row_no, raw, data, status, match_id, candidates, messages, review_code)
    values (v_job, (r->>'row_no')::int, coalesce(r->'raw', r->'data'), coalesce(a->'data', '{}'),
            case when v_dup then 'DUPLICATE' else a->>'status' end, nullif(a->>'match_id','')::uuid, a->'candidates',
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(a->'messages','[]')) x), '{}') || case when v_dup then array['Повтор в этом файле'] else '{}'::text[] end,
            a->>'review_code')
    returning id into v_id;
    if a->>'status' = 'NEEDS_REVIEW' and not v_dup then
      perform import_dq_sync(v_job, v_id, a->>'review_code', 'Импорт «' || p_file_name || '», строка ' || (r->>'row_no') || ': ' || coalesce(a->'messages'->>0, 'требуется решение'), true);
    end if;
  end loop;
  update import_jobs j set total_rows = c.t, new_rows = c.n, updated_rows = c.u, unchanged_rows = c.x, duplicate_rows = c.d, review_rows = c.r, error_rows = c.e
    from (select count(*) t, count(*) filter (where status='NEW') n, count(*) filter (where status='UPDATED') u,
                 count(*) filter (where status='UNCHANGED') x, count(*) filter (where status='DUPLICATE') d,
                 count(*) filter (where status='NEEDS_REVIEW') r, count(*) filter (where status='ERROR') e
            from import_job_rows where job_id = v_job) c where j.id = v_job;
  return v_job;
end $$;

create function import_resolve_row(p_row bigint, p_decision text, p_match uuid default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare r import_job_rows%rowtype; j import_jobs%rowtype;
begin
  select * into r from import_job_rows where id = p_row;
  if not found then raise exception 'Строка не найдена' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = r.job_id;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.status <> 'STAGED' then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  if r.status <> 'NEEDS_REVIEW' then raise exception 'Строке не требуется решение' using errcode = 'P0015'; end if;
  if p_decision not in ('APPLY','SKIP','MATCH') then raise exception 'Неизвестное решение' using errcode = 'P0015'; end if;
  if p_decision = 'MATCH' and (p_match is null or not exists (select 1 from employees where id = p_match)) then
    raise exception 'Выберите сотрудника из справочника' using errcode = 'P0015'; end if;
  if p_decision = 'APPLY' and r.review_code in ('EMPLOYEE_NOT_FOUND','EMPLOYEE_AMBIGUOUS','EMPLOYEE_FUZZY') and j.entity <> 'EMPLOYEES' then
    raise exception 'Для сотрудника выберите «сопоставить» или «пропустить»: сотрудники из импорта списков не создаются' using errcode = 'P0015'; end if;
  update import_job_rows set decision = p_decision, decision_match = case when p_decision = 'MATCH' then p_match end, decided_by = auth.uid(), decided_at = now() where id = p_row;
  perform import_dq_sync(r.job_id, p_row, null, null, false);
end $$;

-- ---------- Commit ----------
create function import_commit(p_job uuid, p_reason text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; r import_job_rows%rowtype; v_ins integer := 0; v_upd integer := 0; v_skip integer := 0; v_emp uuid; v_id uuid;
        d jsonb; v_patch jsonb; v_hash text; v_skill smallint; v_reason text; v_action text;
begin
  select * into j from import_jobs where id = p_job for update;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.status <> 'STAGED' then raise exception 'Импорт уже выполнен или отменён' using errcode = 'P0015'; end if;
  v_reason := coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Импорт: ' || j.file_name);
  perform set_config('app.change_reason', v_reason, true);
  for r in select * from import_job_rows where job_id = p_job order by row_no loop
    d := r.data; v_id := null; v_action := null;
    if r.status in ('UNCHANGED','DUPLICATE','ERROR') or (r.status = 'NEEDS_REVIEW' and coalesce(r.decision, 'SKIP') = 'SKIP') then
      v_skip := v_skip + 1; continue;
    end if;
    v_emp := coalesce(case when r.decision = 'MATCH' then r.decision_match end, r.match_id);
    v_hash := md5(r.raw::text);
    if j.entity = 'EMPLOYEES' then
      if v_emp is null then
        v_id := create_employee(d, v_reason); v_ins := v_ins + 1;
      else
        v_patch := d - 'full_name' - 'employee_code' || jsonb_build_object('full_name', d->>'full_name');
        if (d->>'employee_code') is not null then v_patch := v_patch || jsonb_build_object('employee_code', d->>'employee_code'); end if;
        perform update_employee(v_emp, v_patch, v_reason); v_id := v_emp; v_upd := v_upd + 1;
      end if;
      perform import_lineage(p_job, r.row_no, v_hash, 'employees', v_id);
    elsif j.entity = 'PARTICIPANTS' then
      if v_emp is null then v_skip := v_skip + 1; continue; end if;
      if (select count(*) from add_participants((j.options->>'training_id')::uuid, array[v_emp], v_reason) x) is not null then null; end if;
      v_id := v_emp; v_ins := v_ins + 1;
      perform import_lineage(p_job, r.row_no, v_hash, 'training_participants', v_emp);
    elsif j.entity = 'EXAMS' then
      if v_emp is null then v_skip := v_skip + 1; continue; end if;
      v_skill := nullif(d->>'skill_id','')::smallint;
      if v_skill is null then
        v_skill := upsert_skill(null, jsonb_build_object('name', d->>'qualification', 'kind', 'QUALIFICATION'), v_reason);
      end if;
      v_id := create_exam(jsonb_build_object('employee_id', v_emp, 'skill_id', v_skill, 'exam_date', d->>'exam_date'), v_reason);
      if d->>'result' <> 'PENDING' then perform set_exam_result(v_id, d->>'result', nullif(d->>'score','')::numeric, null, v_reason); end if;
      if nullif(d->>'fee','') is not null and app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]) then
        perform set_exam_cost(v_id, jsonb_build_object('fee', replace(d->>'fee', ',', '.'), 'currency', coalesce(d->>'currency', 'TJS'),
                 'funding_source', coalesce(d->>'funding_source', 'COMPANY'), 'fee_date', d->>'exam_date'), v_reason);
      end if;
      v_ins := v_ins + 1; perform import_lineage(p_job, r.row_no, v_hash, 'exams', v_id);
    elsif j.entity = 'CERTIFICATES' then
      if v_emp is null then v_skip := v_skip + 1; continue; end if;
      v_id := create_certificate(d - 'full_name' || jsonb_build_object('employee_id', v_emp), v_reason);
      v_ins := v_ins + 1; perform import_lineage(p_job, r.row_no, v_hash, 'certificates', v_id);
    elsif j.entity = 'LEARNING_EVENTS' then
      v_id := create_training(jsonb_build_object('title', d->>'title', 'event_type_id', d->>'event_type_id', 'start_date', d->>'start_date',
                 'end_date', d->>'end_date', 'hours', d->>'hours', 'format', d->>'format', 'location', d->>'location', 'organizer', d->>'organizer'), v_reason);
      v_ins := v_ins + 1; perform import_lineage(p_job, r.row_no, v_hash, 'trainings', v_id);
    elsif j.entity = 'EXPENSES' then
      v_id := add_expense((d->>'training_id')::uuid, (d->>'category_id')::smallint, (d->>'amount')::numeric, (d->>'currency')::currency_code,
                          (d->>'date')::date, d->>'comment', v_reason);
      v_ins := v_ins + 1; perform import_lineage(p_job, r.row_no, v_hash, 'expense_operations', v_id);
    end if;
    update import_job_rows set applied_id = v_id where id = r.id;
    perform import_dq_sync(p_job, r.id, null, null, false);
  end loop;
  update import_jobs set status = 'COMMITTED', committed_at = now(), committed_by = auth.uid(), inserted = v_ins, updated = v_upd, skipped = v_skip,
         conflicts = (select count(*) from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW') where id = p_job;
  return jsonb_build_object('inserted', v_ins, 'updated', v_upd, 'skipped', v_skip);
end $$;

create function import_cancel(p_job uuid, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; r bigint;
begin
  select * into j from import_jobs where id = p_job for update;
  if not found or not can_import(j.entity) then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if j.status <> 'STAGED' then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', req_reason(p_reason), true);
  update import_jobs set status = 'CANCELLED' where id = p_job;
  for r in select id from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW' loop
    perform import_dq_sync(p_job, r, null, null, false);
  end loop;
end $$;

-- ---------- Массовые операции ----------
create function bulk_update_employees(p_ids uuid[], p_patch jsonb, p_reason text) returns integer
language plpgsql set search_path = public, pg_temp as $$
declare v uuid; n integer := 0;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Не выбрано ни одного сотрудника' using errcode = 'P0015'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 500 then raise exception 'Не больше 500 сотрудников за раз' using errcode = 'P0015'; end if;
  foreach v in array p_ids loop
    perform update_employee(v, p_patch, req_reason(p_reason)); n := n + 1;
  end loop;
  return n;
end $$;

create function set_participant_result(p_participant uuid, p_result text, p_note text, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if p_result is not null and p_result not in ('COMPLETED','NOT_COMPLETED','PASSED','FAILED') then
    raise exception 'Недопустимый результат' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', req_reason(p_reason), true);
  update training_participants set result = p_result, result_note = nullif(trim(coalesce(p_note,'')), '') where id = p_participant;
  if not found then raise exception 'Участник не найден' using errcode = 'P0015'; end if;
end $$;

-- ---------- Уведомления ----------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('NEW_REQUEST','DATA_QUALITY','CERTIFICATE_EXPIRING','EXAM_RESULT_REQUIRED','CONTRACT_EXPIRING','FUNDING_OBLIGATION','IMPORT_CONFLICT','TRAINING_REQUIRES_ACTION')),
  severity text not null default 'INFO' check (severity in ('CRITICAL','WARNING','INFO')),
  title text not null,
  body text,
  href text,
  roles app_role[] not null,
  dedupe_key text not null unique,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index notifications_open_idx on notifications (created_at desc) where resolved_at is null;
create table notification_reads (
  user_id uuid not null references profiles(id),
  notification_id uuid not null references notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, notification_id)
);
create index notification_reads_notification_idx on notification_reads (notification_id);
alter table notifications enable row level security;
alter table notification_reads enable row level security;
create policy notifications_read on notifications for select to authenticated using (resolved_at is null and app_role() = any (roles));
create policy notification_reads_own on notification_reads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Пересчёт уведомлений по текущему состоянию данных; безопасен для вызова любым пользователем (результат фильтруется по ролям RLS).
create function notify_scan() returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare v_last timestamptz; n integer;
begin
  if app_role() is null then raise exception 'Нет доступа' using errcode = '42501'; end if;
  select updated_at into v_last from app_settings where key = 'notify_scan_at';
  if v_last is not null and v_last > now() - interval '60 seconds' then return 0; end if;
  insert into app_settings(key, value, description) values ('notify_scan_at', 'x', 'Время последнего пересчёта уведомлений')
    on conflict (key) do update set updated_at = now();
  create temp table _n(dedupe_key text, type text, severity text, title text, body text, href text, roles app_role[]) on commit drop;
  insert into _n select 'REQ|' || r.id, 'NEW_REQUEST', 'INFO', 'Новая заявка ' || r.canonical_id, r.topic, '/trainings/requests/' || r.id,
         '{ADMIN,ACADEMY_MANAGER}'::app_role[] from training_requests r where r.archived_at is null and r.status = 'NEW';
  insert into _n select 'DQ|' || d.id, 'DATA_QUALITY', 'CRITICAL', 'Критичная проблема данных', d.message, '/data-quality?rule=' || d.rule_code,
         '{ADMIN,ACADEMY_MANAGER}'::app_role[] from dq_issues d where d.severity = 'CRITICAL' and d.status in ('OPEN','IN_REVIEW');
  insert into _n select 'CERT|' || c.id, 'CERTIFICATE_EXPIRING', case when c.expiration_date < current_date then 'WARNING' else 'INFO' end,
         case when c.expiration_date < current_date then 'Сертификат истёк' else 'Сертификат истекает через ' || (c.expiration_date - current_date) || ' дн.' end,
         c.name || ' — ' || e.full_name, '/employees/' || c.employee_id || '?tab=certificates', '{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]
    from certificates c join employees e on e.id = c.employee_id
   where c.archived_at is null and c.revoked_at is null and c.expiration_date is not null and c.expiration_date <= current_date + 30 and e.is_active;
  insert into _n select 'EXAM|' || x.id, 'EXAM_RESULT_REQUIRED', 'WARNING', 'Нужен результат экзамена ' || x.canonical_id,
         e.full_name || ', ' || s.name || ', ' || x.exam_date, '/exams/' || x.id, '{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]
    from exams x join employees e on e.id = x.employee_id join skills s on s.id = x.skill_id
   where x.archived_at is null and x.status = 'SCHEDULED' and x.result = 'PENDING' and x.exam_date < current_date;
  insert into _n select 'DOC|' || d.id, 'CONTRACT_EXPIRING', 'INFO', 'Срок договора истекает ' || d.expires_on, d.title, '/employees/' || d.employee_id || '?tab=documents',
         '{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[] from documents d
   where d.archived_at is null and d.expires_on is not null and d.expires_on <= current_date + 30 and d.doc_type in ('CONTRACT','AGREEMENT') and d.employee_id is not null;
  insert into _n select 'AGR|' || a.id, 'FUNDING_OBLIGATION', 'WARNING', 'Обязательство ждёт проверки (' || a.canonical_id || ')',
         a.repayment_amount || ' ' || a.currency, '/funding/' || a.id, '{ADMIN,FINANCE}'::app_role[]
    from learning_agreements a where a.status = 'OBLIGATION_CREATED' and a.reviewed_at is null;
  insert into _n select 'IMP|' || j.id, 'IMPORT_CONFLICT', 'WARNING', 'Импорт ждёт решений: ' || j.review_rows || ' строк', j.file_name, '/imports/' || j.id,
         '{ADMIN,ACADEMY_MANAGER,HR}'::app_role[] from import_jobs j where j.status = 'STAGED' and j.review_rows > 0;
  insert into _n select 'TRN|' || t.id, 'TRAINING_REQUIRES_ACTION', 'WARNING', 'Мероприятие не закрыто: ' || t.canonical_id,
         t.title || ' — дата окончания ' || t.end_date || ', статус ' || t.status, '/trainings/' || t.id, '{ADMIN,ACADEMY_MANAGER}'::app_role[]
    from trainings t where t.archived_at is null and t.end_date < current_date - 7 and t.status::text in ('DRAFT','PLANNED','APPROVED','REGISTERED','IN_PROGRESS');
  insert into notifications(dedupe_key, type, severity, title, body, href, roles)
    select dedupe_key, type, severity, title, body, href, roles from _n
  on conflict (dedupe_key) do update set severity = excluded.severity, title = excluded.title, body = excluded.body, href = excluded.href,
        roles = excluded.roles, resolved_at = null;
  update notifications set resolved_at = now() where resolved_at is null and dedupe_key not in (select dedupe_key from _n);
  select count(*) into n from _n;
  drop table _n;
  return n;
end $$;

create function mark_notifications_read(p_ids uuid[]) returns integer language plpgsql set search_path = public, pg_temp as $$
declare n integer;
begin
  if app_role() is null then raise exception 'Нет доступа' using errcode = '42501'; end if;
  insert into notification_reads(user_id, notification_id)
  select auth.uid(), id from notifications where (p_ids is null or id = any (p_ids)) and resolved_at is null and app_role() = any (roles)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- «Требует внимания» ----------
create function attention_summary() returns table(kind text, label text, cnt integer, href text, severity text)
language sql stable set search_path = public, pg_temp as $$
  select * from (
    select 'DQ_CRITICAL', 'критичных проблем данных', (select count(*)::int from dq_issues where severity = 'CRITICAL' and status in ('OPEN','IN_REVIEW')), '/data-quality?severity=CRITICAL', 'CRITICAL'
    union all select 'REQUESTS', 'заявок ожидают', (select count(*)::int from training_requests where archived_at is null and status = 'NEW'), '/trainings/requests?status=NEW', 'INFO'
    union all select 'IMPORT_MATCH', 'строк импорта требуют сопоставления', (select coalesce(sum(review_rows), 0)::int from import_jobs where status = 'STAGED'), '/imports', 'WARNING'
    union all select 'CERT_EXPIRING', 'сертификатов истекают (30 дней)', (select count(*)::int from certificates where archived_at is null and revoked_at is null
              and expiration_date is not null and expiration_date between current_date and current_date + 30), '/certificates?filter=expiring', 'WARNING'
    union all select 'EXAM_RESULT', 'экзаменов требуют результата', (select count(*)::int from exams where archived_at is null and status = 'SCHEDULED' and result = 'PENDING' and exam_date < current_date), '/exams?filter=no-result', 'WARNING'
    union all select 'NO_CONTRACT', 'договоров отсутствуют', (select count(*)::int from dq_issues where rule_code in ('FUNDING_NO_CONTRACT','AGREEMENT_NO_CONTRACT') and status in ('OPEN','IN_REVIEW')), '/data-quality?rule=FUNDING_NO_CONTRACT', 'WARNING'
    union all select 'FUNDED_NO_RESULT', 'соглашений о финансировании без результата', (select count(*)::int from learning_agreements a where a.status = 'ACTIVE' and a.evaluated_at is null
              and ((a.exam_id is not null and exists (select 1 from exams x where x.id = a.exam_id and x.result = 'PENDING'))
                or (a.training_id is not null and not exists (select 1 from training_participants p where p.training_id = a.training_id and p.employee_id = a.employee_id and p.result is not null)))), '/funding', 'INFO'
    union all select 'OBLIGATIONS', 'обязательств ждут проверки', (select count(*)::int from learning_agreements where status = 'OBLIGATION_CREATED' and reviewed_at is null), '/funding', 'WARNING'
  ) t(kind, label, cnt, href, severity) where cnt > 0
$$;

-- ---------- Глобальный поиск (Ctrl+K): под правами вызывающего, RLS фильтрует ----------
create function global_search(p_q text, p_limit integer default 8) returns table(kind text, id text, title text, subtitle text, href text)
language plpgsql stable set search_path = public, pg_temp as $$
declare q text := '%' || replace(replace(replace(trim(coalesce(p_q,'')), '\', '\\'), '%', '\%'), '_', '\_') || '%'; l integer := greatest(least(coalesce(p_limit, 8), 20), 1);
begin
  if app_role() is null or length(trim(coalesce(p_q,''))) < 2 then return; end if;
  return query select 'EMPLOYEE', e.id::text, e.full_name, coalesce(e."position", '') || coalesce(' · ' || e.employee_code, ''), '/employees/' || e.id
    from employees e where e.full_name ilike q or e.employee_code ilike q or e.canonical_id ilike q order by e.is_active desc, e.full_name limit l;
  return query select 'TRAINING', t.id::text, t.title, t.canonical_id || ' · ' || et.name || ' · ' || t.start_date, '/trainings/' || t.id
    from trainings t join learning_event_types et on et.id = t.event_type_id
   where t.title ilike q or t.canonical_id ilike q or coalesce(t.organizer,'') ilike q or coalesce(t.description,'') ilike q
   order by t.start_date desc limit l;
  return query select 'REQUEST', r.id::text, r.topic, r.canonical_id || ' · ' || r.status, '/trainings/requests/' || r.id
    from training_requests r where r.topic ilike q or r.canonical_id ilike q or coalesce(r.goal,'') ilike q order by r.created_at desc limit l;
  return query select 'EXAM', x.id::text, s.name || ' — ' || e.full_name, x.canonical_id || ' · попытка ' || x.attempt_no || ' · ' || x.result, '/exams/' || x.id
    from exams x join skills s on s.id = x.skill_id join employees e on e.id = x.employee_id
   where s.name ilike q or x.canonical_id ilike q or e.full_name ilike q order by x.exam_date desc limit l;
  return query select 'CERTIFICATE', c.id::text, c.name, e.full_name || coalesce(' · ' || c.certificate_number, ''), '/employees/' || c.employee_id || '?tab=certificates'
    from certificates c join employees e on e.id = c.employee_id
   where c.name ilike q or coalesce(c.certificate_number,'') ilike q or coalesce(c.issuing_organization,'') ilike q order by c.created_at desc limit l;
  return query select 'CONTRACT', a.id::text, a.canonical_id || coalesce(' · ' || a.contract_number, ''), e.full_name || ' · ' || a.status, '/funding/' || a.id
    from learning_agreements a join employees e on e.id = a.employee_id
   where a.canonical_id ilike q or coalesce(a.contract_number,'') ilike q order by a.created_at desc limit l;
  return query select 'CONTRACT', d.id::text, d.title, d.doc_type || coalesce(' · ' || e.full_name, ''), '/employees/' || d.employee_id || '?tab=documents'
    from documents d left join employees e on e.id = d.employee_id
   where d.employee_id is not null and d.archived_at is null and d.doc_type in ('CONTRACT','AGREEMENT') and d.title ilike q order by d.uploaded_at desc limit l;
  -- сотрудники, связанные с запросом: экзамены, сертификаты, навыки, участие в мероприятиях
  return query select distinct on (e.id) 'EMPLOYEE', e.id::text, e.full_name, 'Связано: ' || rel.what, '/employees/' || e.id
    from (select x.employee_id eid, s.name what from exams x join skills s on s.id = x.skill_id where s.name ilike q
          union all select c.employee_id, c.name from certificates c where c.name ilike q
          union all select k.employee_id, s.name from employee_skills k join skills s on s.id = k.skill_id where s.name ilike q
          union all select p.employee_id, t.title from training_participants p join trainings t on t.id = p.training_id where t.title ilike q) rel
    join employees e on e.id = rel.eid order by e.id limit l;
end $$;

revoke execute on function can_import(text), parse_date_text(text), find_org_units(text, org_level, bigint), import_bool(text),
  import_analyze_row(text, jsonb, jsonb), import_stage(text, text, text, text, jsonb, jsonb, jsonb), import_resolve_row(bigint, text, uuid),
  import_commit(uuid, text), import_cancel(uuid, text), bulk_update_employees(uuid[], jsonb, text), set_participant_result(uuid, text, text, text),
  notify_scan(), mark_notifications_read(uuid[]), attention_summary(), global_search(text, integer) from public, anon;
grant execute on function can_import(text), parse_date_text(text), find_org_units(text, org_level, bigint), import_bool(text),
  import_analyze_row(text, jsonb, jsonb), import_stage(text, text, text, text, jsonb, jsonb, jsonb), import_resolve_row(bigint, text, uuid),
  import_commit(uuid, text), import_cancel(uuid, text), bulk_update_employees(uuid[], jsonb, text), set_participant_result(uuid, text, text, text),
  notify_scan(), mark_notifications_read(uuid[]), attention_summary(), global_search(text, integer) to authenticated;
-- DEFINER-помощники проверяют право на импорт сами (can_import по заданию), поэтому доступны только участникам импорта
revoke execute on function import_dq_sync(uuid, bigint, text, text, boolean), import_lineage(uuid, integer, text, text, uuid) from public, anon;
grant execute on function import_dq_sync(uuid, bigint, text, text, boolean), import_lineage(uuid, integer, text, text, uuid) to authenticated;
