-- Откат M20 (Phase 3A.1): импорты, уведомления, поиск, массовые действия.
-- Данные импортов и уведомлений удаляются безвозвратно; уже применённые изменения сотрудников/участников остаются.
drop table if exists import_job_rows, import_jobs, notification_reads, notifications cascade;
delete from app_settings where key = 'notify_scan_at';
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array['can_import','parse_date_text','find_org_units','import_bool','import_analyze_row','import_dq_sync','import_lineage','import_stage','import_resolve_row','import_commit','import_cancel','bulk_update_employees','set_participant_result','notify_scan','mark_notifications_read','attention_summary','global_search']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
