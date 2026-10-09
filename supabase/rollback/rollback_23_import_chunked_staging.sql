-- Откат M23: пакетная загрузка импорта. Незавершённые задания STAGING отменяются (их строки остаются), затем возвращается прежнее ограничение статусов.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname = any (array['import_row_key','import_stage_begin','import_stage_append','import_stage_finish','import_stage_abort']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
update import_jobs set status = 'CANCELLED' where status = 'STAGING';
alter table import_jobs drop constraint if exists import_jobs_status_check;
alter table import_jobs add constraint import_jobs_status_check check (status in ('STAGED','COMMITTED','CANCELLED','FAILED'));
alter table import_job_rows drop column if exists dup_key;
