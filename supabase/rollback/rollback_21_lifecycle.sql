-- Откат M21 (Phase 3A.2): сквозной жизненный цикл. Возвращает схему к состоянию после M20.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
    'upsert_trainer','set_training_trainer','remove_training_trainer','set_session_details','set_request_details','create_training_from_request',
    'send_feedback_invitations','record_feedback_response','training_feedback_summary','training_summary','lifecycle_kpis',
    'department_participation','trainer_performance','training_results','global_search_ext','dq_scan_lifecycle']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
-- проблемы качества новых правил теряют смысл без самих правил
delete from dq_issues where rule_code in ('TRAINING_NO_TRAINER','FEEDBACK_NO_TRAINING','FEEDBACK_NON_PARTICIPANT','FEEDBACK_NO_INVITATION','CERT_NOT_PARTICIPANT',
  'EXPENSE_ON_CANCELLED','SESSION_OUTSIDE_RANGE','ATTENDANCE_ON_CANCELLED_SESSION','PARTICIPANT_NO_SNAPSHOT','PARTICIPANT_NO_RESULT','COMPLETED_NO_FEEDBACK_REQUEST');
drop table if exists feedback_invitations;
delete from app_settings where key in ('feedback_weight_materials','feedback_weight_trainer','feedback_weight_org');
alter table training_requests drop constraint if exists training_requests_priority_check, drop column if exists priority, drop column if exists expected_result;
alter table training_sessions drop constraint if exists training_sessions_time_check, drop constraint if exists training_sessions_status_check,
  drop column if exists start_time, drop column if exists end_time, drop column if exists room, drop column if exists trainer_id, drop column if exists status;
drop index if exists training_trainers_one_primary, training_trainers_trainer_idx, trainers_name_norm_idx;
alter table training_trainers drop constraint if exists training_trainers_id_key, drop constraint if exists training_trainers_role_check,
  drop column if exists id, drop column if exists role, drop column if exists created_at;
alter table trainers drop column if exists organization;
drop sequence if exists trainer_code_seq;
