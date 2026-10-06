-- Откат M10 (Phase 3 · training model). Данные посещаемости теряются.
drop trigger if exists audit_session_attendance on session_attendance;
drop table if exists session_attendance;
drop type if exists attendance_status;
drop trigger if exists sessions_sync_training on training_sessions;
drop trigger if exists participants_prepare on training_participants;
drop trigger if exists trainings_stamp_actor on trainings;
drop trigger if exists training_requests_stamp_actor on training_requests;
drop trigger if exists training_requests_touch on training_requests;
drop function if exists next_training_code(integer);
drop function if exists trg_stamp_actor(), trg_requests_touch(), trg_participant_prepare(),
  trg_attendance_check(), trg_attendance_sync(), trg_sessions_sync_training();

create or replace function participants_count(p_training uuid) returns integer
language sql stable as $$
  select count(*)::int from training_participants where training_id = p_training and attended
$$;

create or replace function man_hours(p_training uuid) returns numeric
language sql stable as $$
  select coalesce(sum(coalesce(s.hours, t.hours)),0)
  from training_participants p
  join trainings t on t.id = p.training_id
  left join training_sessions s on s.id = p.session_id
  where p.training_id = p_training and p.attended
$$;

create or replace function employee_dossier(p_employee uuid)
returns table(
  year integer, training_id uuid, title text, start_date date, end_date date,
  hours numeric, kind training_kind, source_type source_type,
  department_at_time text, unit_at_time text, position_at_time text,
  cost_share_tjs numeric)
language sql stable as $$
  select extract(year from t.start_date)::int, t.id, t.title,
         coalesce(s.start_date, t.start_date), coalesce(s.end_date, t.end_date),
         coalesce(s.hours, t.hours), t.kind, t.source_type,
         p.department_snapshot, p.unit_snapshot, p.position_snapshot,
         cost_per_participant(t.id)
  from training_participants p
  join trainings t on t.id = p.training_id
  left join training_sessions s on s.id = p.session_id
  where p.employee_id = p_employee and p.attended
  order by 1, 4
$$;
alter function participants_count(uuid) set search_path = public, pg_temp;
alter function man_hours(uuid) set search_path = public, pg_temp;
alter function employee_dossier(uuid) set search_path = public, pg_temp;
drop function if exists has_attendance(uuid);

drop index if exists participants_session_idx, training_requests_year_idx;
alter table training_participants drop column added_at, drop column added_by, drop column note;
alter table training_sessions drop column location, drop column comment;
alter table training_requests drop column updated_at, drop column created_by, drop column updated_by,
  drop column archived_at, drop column archived_by, drop column archive_reason;
alter table trainings drop column description, drop column participants_planned,
  drop column created_by, drop column updated_by;
