-- Phase 3B · M22 — сохранённые источники Google Sheets (синхронизация сотрудников) и создание обучения сразу с участниками.
-- Зачем нужна миграция: в схеме нет места для (1) сохранённого источника (URL, лист, соответствие колонок, итог последней
-- синхронизации) и (2) учёта, каких сотрудников источник уже приносил — без этого нельзя заметить, что сотрудник исчез из
-- таблицы. Конвейер импорта (import_jobs/import_job_rows/import_stage/import_commit, source_files/source_records) переиспользуется
-- без изменений; ни одна существующая функция не переопределяется.

-- ========== 1. Источник ==========
create table import_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  kind text not null default 'GSHEET' check (kind in ('GSHEET')),
  entity text not null default 'EMPLOYEES' check (entity in ('EMPLOYEES')),
  spreadsheet_id text not null check (spreadsheet_id ~ '^[A-Za-z0-9_-]{20,100}$'),
  spreadsheet_url text not null check (spreadsheet_url ~ '^https://docs\.google\.com/spreadsheets/d/'),
  sheet_name text not null check (length(sheet_name) between 1 and 100),
  header_row integer check (header_row between 1 and 50),
  -- поле сущности → название колонки в таблице (по названию, а не по номеру: перестановка колонок не ломает синхронизацию)
  mapping jsonb not null default '{}'::jsonb check (jsonb_typeof(mapping) = 'object'),
  is_active boolean not null default true,
  last_sync_at timestamptz,
  last_status text not null default 'NEVER' check (last_status in ('NEVER','STAGED','NEEDS_REVIEW','SUCCESS','FAILED')),
  last_job_id uuid references import_jobs(id),
  last_stats jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  unique (entity, spreadsheet_id, sheet_name)
);
alter table import_sources enable row level security;
create policy import_sources_read on import_sources for select to authenticated using (can_import(entity));
create policy import_sources_write on import_sources for all to authenticated using (can_import(entity)) with check (can_import(entity));
grant select, insert, update on import_sources to authenticated;
revoke all on import_sources from anon;
create trigger audit_import_sources after insert or update or delete on import_sources for each row execute function trg_audit();

-- Кого источник уже приносил: основа сверки «сотрудник исчез из таблицы». Пишется только функцией record_source_sync.
create table import_source_members (
  source_id uuid not null references import_sources(id) on delete cascade,
  employee_id uuid not null references employees(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_job uuid references import_jobs(id),
  missing_since timestamptz,
  primary key (source_id, employee_id)
);
create index import_source_members_employee_idx on import_source_members (employee_id);
alter table import_source_members enable row level security;
create policy import_source_members_read on import_source_members for select to authenticated
  using (exists (select 1 from import_sources s where s.id = source_id and can_import(s.entity)));
grant select on import_source_members to authenticated;
revoke all on import_source_members from anon;

create function save_import_source(p jsonb, p_id uuid default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_url text := trim(coalesce(p->>'spreadsheet_url', '')); v_sid text := trim(coalesce(p->>'spreadsheet_id', ''));
begin
  if not can_import('EMPLOYEES') then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  perform set_config('app.change_reason', 'Источник Google Sheets', true);
  if p_id is null then
    if v_sid = '' or v_url = '' or coalesce(trim(p->>'sheet_name'), '') = '' then
      raise exception 'Укажите таблицу и лист' using errcode = 'P0015'; end if;
    if exists (select 1 from import_sources where entity = 'EMPLOYEES' and spreadsheet_id = v_sid and sheet_name = p->>'sheet_name') then
      raise exception 'Этот лист уже сохранён как источник' using errcode = 'P0015'; end if;
    insert into import_sources(name, spreadsheet_id, spreadsheet_url, sheet_name, header_row, mapping)
    values (coalesce(nullif(trim(p->>'name'), ''), 'Google Sheets'), v_sid, v_url, p->>'sheet_name',
            nullif(p->>'header_row', '')::integer, coalesce(p->'mapping', '{}'::jsonb))
    returning id into v_id;
    return v_id;
  end if;
  update import_sources set
    name = case when p ? 'name' then trim(p->>'name') else name end,
    header_row = case when p ? 'header_row' then nullif(p->>'header_row', '')::integer else header_row end,
    mapping = case when p ? 'mapping' then p->'mapping' else mapping end,
    is_active = case when p ? 'is_active' then (p->>'is_active')::boolean else is_active end,
    updated_at = now(), updated_by = auth.uid()
   where id = p_id;
  if not found then raise exception 'Источник не найден' using errcode = 'P0015'; end if;
  return p_id;
end $$;

-- Итог синхронизации. Вызывается после dry run (import_stage) и после применения (import_commit).
-- Сотрудники, которых источник приносил раньше, а сейчас в таблице нет: не удаляются, получают missing_since и замечание DQ.
create function record_source_sync(p_source uuid, p_job uuid, p_error text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s import_sources%rowtype; j import_jobs%rowtype; v_stats jsonb; v_unresolved integer; v_missing integer := 0; v_seen uuid[];
begin
  if not can_import('EMPLOYEES') then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  select * into s from import_sources where id = p_source for update;
  if not found then raise exception 'Источник не найден' using errcode = 'P0015'; end if;
  if p_error is not null then
    update import_sources set last_sync_at = now(), last_status = 'FAILED', last_error = left(p_error, 500), updated_at = now() where id = p_source;
    return jsonb_build_object('status', 'FAILED');
  end if;
  select * into j from import_jobs where id = p_job;
  if not found or coalesce(j.options->>'source_id', '') <> p_source::text then
    raise exception 'Импорт не относится к этому источнику' using errcode = 'P0015'; end if;
  select count(*)::int into v_unresolved from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW' and decision is null;
  v_stats := jsonb_build_object('rows_read', j.total_rows, 'created', j.new_rows, 'updated', j.updated_rows, 'unchanged', j.unchanged_rows,
                                'issues', j.review_rows + j.error_rows + j.duplicate_rows, 'review', v_unresolved, 'errors', j.error_rows, 'duplicates', j.duplicate_rows);
  if j.status = 'COMMITTED' then
    -- кого принесла эта синхронизация: применённые строки (lineage) + неизменённые сопоставленные
    select array_agg(distinct x) into v_seen from (
      select r.entity_id::uuid x from source_records r join source_files f on f.id = r.source_file_id
       where f.system = 'IMPORT:EMPLOYEES' and f.file_hash = p_job::text and r.entity_table = 'employees'
      union
      select coalesce(case when jr.decision = 'MATCH' then jr.decision_match end, jr.match_id) from import_job_rows jr
       where jr.job_id = p_job and jr.status = 'UNCHANGED') t where x is not null;
    insert into import_source_members(source_id, employee_id, last_seen_job)
    select p_source, e, p_job from unnest(coalesce(v_seen, '{}')) e
    on conflict (source_id, employee_id) do update set last_seen_at = now(), last_seen_job = p_job, missing_since = null;
    update dq_issues set status = 'FIXED', resolved_at = now(), resolution = 'Сотрудник снова есть в источнике', updated_at = now()
     where rule_code = 'SOURCE_EMPLOYEE_MISSING' and status in ('OPEN','IN_REVIEW')
       and fingerprint = any (select 'SOURCE_EMPLOYEE_MISSING|' || p_source || '|' || e from unnest(coalesce(v_seen, '{}')) e);
    with gone as (
      update import_source_members m set missing_since = coalesce(m.missing_since, now())
       where m.source_id = p_source and not (m.employee_id = any (coalesce(v_seen, '{}')))
      returning m.employee_id
    ), ins as (
      insert into dq_issues(rule_code, severity, entity_table, entity_id, message, suggestion, details, fingerprint, source)
      select 'SOURCE_EMPLOYEE_MISSING', 'WARNING', 'employees', g.employee_id::text,
             'Сотрудника «' || e.full_name || '» больше нет в источнике «' || s.name || '» (лист «' || s.sheet_name || '»).',
             'Проверьте: уволен, переименован или строка удалена по ошибке. Сотрудник в TMS не удаляется.',
             jsonb_build_object('employee_id', g.employee_id, 'source_id', p_source), 'SOURCE_EMPLOYEE_MISSING|' || p_source || '|' || g.employee_id, 'IMPORT'
        from gone g join employees e on e.id = g.employee_id
      on conflict (fingerprint) where fingerprint is not null do update
         set status = case when dq_issues.status in ('FIXED') then 'OPEN' else dq_issues.status end, message = excluded.message, updated_at = now()
      returning 1
    ) select count(*)::int into v_missing from gone;
    v_stats := v_stats || jsonb_build_object('created', j.inserted, 'updated', j.updated, 'missing', v_missing);
    update import_sources set last_sync_at = now(), last_status = 'SUCCESS', last_job_id = p_job, last_stats = v_stats, last_error = null, updated_at = now()
     where id = p_source;
  elsif j.status = 'STAGED' then
    update import_sources set last_sync_at = now(), last_status = case when v_unresolved > 0 then 'NEEDS_REVIEW' else 'STAGED' end,
           last_job_id = p_job, last_stats = v_stats, last_error = null, updated_at = now() where id = p_source;
  else
    update import_sources set last_sync_at = now(), last_status = 'FAILED', last_job_id = p_job, last_error = 'Импорт отменён', updated_at = now() where id = p_source;
  end if;
  return v_stats || jsonb_build_object('status', (select last_status from import_sources where id = p_source));
end $$;

-- ========== 2. Обучение сразу с участниками (одна транзакция) ==========
-- REUSE: create_training (валидация, код, заявка/тип PLANNED) + add_participants (снимок подразделения, уникальность, посещаемость).
create function create_training_with_participants(p jsonb, p_employees uuid[], p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_ids uuid[]; v_bad integer;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_employees, '{}')) x where x is not null;
  if array_length(v_ids, 1) > 3000 then raise exception 'Не больше 3000 участников за раз' using errcode = 'P0015'; end if;
  select count(*)::int into v_bad from unnest(v_ids) x where not exists (select 1 from employees e where e.id = x and e.is_active);
  if v_bad > 0 then
    raise exception 'Участниками могут быть только активные сотрудники справочника (не найдено или неактивно: %)', v_bad using errcode = 'P0015'; end if;
  v_id := create_training(p, p_reason);
  if coalesce(array_length(v_ids, 1), 0) > 0 then
    perform add_participants(v_id, v_ids, coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Участники при создании обучения'));
  end if;
  return v_id;
end $$;

do $$ declare f text; begin
  foreach f in array array['save_import_source(jsonb, uuid)', 'record_source_sync(uuid, uuid, text)', 'create_training_with_participants(jsonb, uuid[], text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
