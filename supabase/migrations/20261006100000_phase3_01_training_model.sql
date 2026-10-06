-- Phase 3 · M10: модель тренинга (посещаемость по заходам, часы по факту, снимки участников, коды TR-<год>-<n>).
-- Структура старых таблиц не ломается: все новые поля необязательные, прежний расчёт часов остаётся запасным (legacy).

-- ---------- Поля ----------
alter table trainings
  add column description text,
  add column participants_planned integer check (participants_planned >= 0),
  add column created_by uuid references profiles(id),
  add column updated_by uuid references profiles(id);
create index trainings_created_by_idx on trainings (created_by);
create index trainings_updated_by_idx on trainings (updated_by);

alter table training_requests
  add column updated_at timestamptz not null default now(),
  add column created_by uuid references profiles(id),
  add column updated_by uuid references profiles(id),
  add column archived_at timestamptz,
  add column archived_by uuid references profiles(id),
  add column archive_reason text;
create index training_requests_created_by_idx on training_requests (created_by);
create index training_requests_updated_by_idx on training_requests (updated_by);
create index training_requests_archived_by_idx on training_requests (archived_by);
create index training_requests_year_idx on training_requests (plan_year);

alter table training_sessions
  add column location text,
  add column comment text;

alter table training_participants
  add column added_at timestamptz not null default now(),
  add column added_by uuid references profiles(id),
  add column note text;
create index participants_session_idx on training_participants (session_id);
create index participants_added_by_idx on training_participants (added_by);

-- ---------- Посещаемость ----------
create type attendance_status as enum ('PRESENT','ABSENT','EXCUSED');

create table session_attendance (
  participant_id uuid not null references training_participants(id) on delete cascade,
  session_id uuid not null references training_sessions(id) on delete cascade,
  status attendance_status not null default 'PRESENT',
  marked_by uuid references profiles(id),
  marked_at timestamptz not null default now(),
  primary key (participant_id, session_id)
);
create index session_attendance_session_idx on session_attendance (session_id);
create index session_attendance_marked_by_idx on session_attendance (marked_by);
alter table session_attendance enable row level security;

-- ---------- Служебные триггеры ----------
create function trg_stamp_actor() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger trainings_stamp_actor before insert or update on trainings
  for each row execute function trg_stamp_actor();
create trigger training_requests_stamp_actor before insert or update on training_requests
  for each row execute function trg_stamp_actor();

create function trg_requests_touch() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin new.updated_at := now(); return new; end $$;
create trigger training_requests_touch before update on training_requests
  for each row execute function trg_requests_touch();

-- Снимок подразделения/должности на момент участия + проверка, что заход принадлежит тому же тренингу
create function trg_participant_prepare() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare e employees%rowtype;
begin
  if new.session_id is not null and not exists (
       select 1 from training_sessions s where s.id = new.session_id and s.training_id = new.training_id) then
    raise exception 'Заход принадлежит другому тренингу' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.added_by := coalesce(new.added_by, auth.uid());
    select * into e from employees where id = new.employee_id;
    new.department_snapshot := coalesce(new.department_snapshot, (select name from org_units where id = e.department_id));
    new.unit_snapshot       := coalesce(new.unit_snapshot,       (select name from org_units where id = e.unit_id));
    new.position_snapshot   := coalesce(new.position_snapshot, e."position");
  end if;
  return new;
end $$;
create trigger participants_prepare before insert or update on training_participants
  for each row execute function trg_participant_prepare();

-- Отметка посещаемости: участник и заход одного тренинга; attended = есть хотя бы одно «присутствовал»
create function trg_attendance_check() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from training_participants p join training_sessions s on s.training_id = p.training_id
                 where p.id = new.participant_id and s.id = new.session_id) then
    raise exception 'Участник и заход относятся к разным тренингам' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then new.marked_by := coalesce(new.marked_by, auth.uid()); else new.marked_by := auth.uid(); end if;
  new.marked_at := now();
  return new;
end $$;
create trigger attendance_check before insert or update on session_attendance
  for each row execute function trg_attendance_check();

create function trg_attendance_sync() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare pid uuid := coalesce(new.participant_id, old.participant_id);
begin
  update training_participants p
     set attended = exists (select 1 from session_attendance a where a.participant_id = p.id and a.status = 'PRESENT')
   where p.id = pid
     and p.attended is distinct from exists (select 1 from session_attendance a where a.participant_id = p.id and a.status = 'PRESENT');
  return null;
end $$;
create trigger attendance_sync after insert or update or delete on session_attendance
  for each row execute function trg_attendance_sync();

-- Часы и даты тренинга = по заходам, если заходы есть
create function trg_sessions_sync_training() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare tid uuid := coalesce(new.training_id, old.training_id);
begin
  if exists (select 1 from training_sessions where training_id = tid) then
    update trainings t
       set hours = s.h, start_date = s.d1, end_date = s.d2
      from (select sum(hours) h, min(start_date) d1, max(end_date) d2 from training_sessions where training_id = tid) s
     where t.id = tid and (t.hours, t.start_date, t.end_date) is distinct from (s.h, s.d1, s.d2);
  end if;
  return null;
end $$;
create trigger sessions_sync_training after insert or update or delete on training_sessions
  for each row execute function trg_sessions_sync_training();

-- ---------- Расчёты ----------
-- Режим посещаемости: у тренинга есть хотя бы одна отметка. Иначе работает прежний (legacy) расчёт.
create function has_attendance(p_training uuid) returns boolean language sql stable
set search_path = public, pg_temp as $$
  select exists (select 1 from session_attendance a join training_participants p on p.id = a.participant_id
                 where p.training_id = p_training)
$$;

create or replace function participants_count(p_training uuid) returns integer
language sql stable set search_path = public, pg_temp as $$
  select case when has_attendance(p_training)
    then (select count(distinct a.participant_id)::int from session_attendance a
          join training_participants p on p.id = a.participant_id
          where p.training_id = p_training and a.status = 'PRESENT')
    else (select count(*)::int from training_participants where training_id = p_training and attended)
  end
$$;

create or replace function man_hours(p_training uuid) returns numeric
language sql stable set search_path = public, pg_temp as $$
  select case when has_attendance(p_training)
    then (select coalesce(sum(s.hours), 0) from session_attendance a
          join training_participants p on p.id = a.participant_id
          join training_sessions s on s.id = a.session_id
          where p.training_id = p_training and a.status = 'PRESENT')
    else (select coalesce(sum(coalesce(s.hours, t.hours)), 0)
          from training_participants p
          join trainings t on t.id = p.training_id
          left join training_sessions s on s.id = p.session_id
          where p.training_id = p_training and p.attended)
  end
$$;

-- Досье: в режиме посещаемости — по присутствовавшим заходам
create or replace function employee_dossier(p_employee uuid)
returns table(
  year integer, training_id uuid, title text, start_date date, end_date date,
  hours numeric, kind training_kind, source_type source_type,
  department_at_time text, unit_at_time text, position_at_time text,
  cost_share_tjs numeric)
language sql stable set search_path = public, pg_temp as $$
  select extract(year from t.start_date)::int, t.id, t.title,
         coalesce(s.start_date, t.start_date), coalesce(s.end_date, t.end_date),
         coalesce(s.hours, t.hours), t.kind, t.source_type,
         p.department_snapshot, p.unit_snapshot, p.position_snapshot,
         cost_per_participant(t.id)
  from training_participants p
  join trainings t on t.id = p.training_id
  left join training_sessions s on s.id = p.session_id
  where p.employee_id = p_employee and p.attended and not has_attendance(t.id)
  union all
  select extract(year from t.start_date)::int, t.id, t.title,
         min(s.start_date), max(s.end_date), sum(s.hours), t.kind, t.source_type,
         p.department_snapshot, p.unit_snapshot, p.position_snapshot,
         cost_per_participant(t.id)
  from training_participants p
  join trainings t on t.id = p.training_id
  join session_attendance a on a.participant_id = p.id and a.status = 'PRESENT'
  join training_sessions s on s.id = a.session_id
  where p.employee_id = p_employee
  group by t.id, t.title, t.kind, t.source_type, p.id
  order by 1, 4
$$;

-- Следующий код TR-<год>-<номер>; импортированные тренинги сохраняют номер реестра
create function next_training_code(p_year integer) returns text language plpgsql
set search_path = public, pg_temp as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('training_code'));
  select coalesce(max(substring(canonical_id from '^TR-' || p_year || '-(\d+)$')::int), 0) + 1 into n
    from trainings where canonical_id like 'TR-' || p_year || '-%';
  return 'TR-' || p_year || '-' || lpad(n::text, 3, '0');
end $$;

revoke execute on function trg_stamp_actor(), trg_requests_touch(), trg_participant_prepare(),
  trg_attendance_check(), trg_attendance_sync(), trg_sessions_sync_training()
  from public, anon, authenticated, service_role;
revoke execute on function has_attendance(uuid), next_training_code(integer) from public, anon;
grant execute on function has_attendance(uuid), next_training_code(integer) to authenticated;

-- ---------- Аудит и права на новую таблицу ----------
create trigger audit_session_attendance after insert or update or delete on session_attendance
  for each row execute function trg_audit();

-- читают все роли, пишут те же, что участников (ADMIN, ACADEMY_MANAGER, HR)
call grant_table('session_attendance',
  array['ADMIN','ACADEMY_MANAGER','HR','FINANCE','VIEWER']::app_role[],
  array['ADMIN','ACADEMY_MANAGER','HR']::app_role[]);
