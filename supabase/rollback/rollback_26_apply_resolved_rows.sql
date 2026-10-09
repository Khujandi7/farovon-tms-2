-- Откат M26: удаляет функции дозавершения применённого импорта и поля reapplied_at/reapplied_by.
-- Созданные/обновлённые этой функцией сотрудники остаются (это обычные данные справочника, их изменения есть в audit_log);
-- у строк остаются apply_action/applied_id (CREATED/UPDATED) — отметка «дозавершено позже» (reapplied_at) пропадает вместе с полем.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname = any (array['import_match_employees_fast', 'import_job_recount', 'import_reanalyze_job', 'import_resolved_preview', 'import_apply_resolved_batch']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
drop index if exists import_job_rows_reapply_idx;
alter table import_job_rows drop column if exists reapplied_by;
alter table import_job_rows drop column if exists reapplied_at;
