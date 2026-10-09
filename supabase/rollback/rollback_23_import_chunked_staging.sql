-- Откат M23: пакетные загрузка и применение импорта сотрудников.
-- Незавершённая загрузка (STAGING) отменяется, строки остаются. Незавершённое применение (COMMITTING) помечается FAILED:
-- часть строк уже применена, поэтому статус «Применяется» вернуть нельзя; применённые сотрудники остаются (это обычные записи справочника).
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname = any (array['import_row_key','import_analyze_row_fast','import_stage_begin','import_stage_append','import_stage_finish','import_stage_abort','import_commit_batch']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
update import_jobs set status = 'CANCELLED' where status = 'STAGING';
update import_jobs set status = 'FAILED', note = 'Пакетное применение прервано откатом миграции M23' where status = 'COMMITTING';
alter table import_jobs drop constraint if exists import_jobs_status_check;
alter table import_jobs add constraint import_jobs_status_check check (status in ('STAGED','COMMITTED','CANCELLED','FAILED'));
drop index if exists import_job_rows_pending_idx;
drop index if exists import_job_rows_dup_key_idx;
alter table import_job_rows drop column if exists apply_error, drop column if exists apply_action, drop column if exists processed_at, drop column if exists dup_key;
alter table import_jobs drop column if exists apply_errors;
