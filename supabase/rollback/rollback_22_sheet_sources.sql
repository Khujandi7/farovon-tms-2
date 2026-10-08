-- Откат M22 (Phase 3B): источники Google Sheets и создание обучения с участниками. Сотрудники и участники, созданные
-- синхронизацией или формой, остаются (это обычные записи справочника/обучений); удаляются только служебные таблицы.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname = any (array['save_import_source','record_source_sync','create_training_with_participants']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
delete from dq_issues where rule_code = 'SOURCE_EMPLOYEE_MISSING';
drop table if exists import_source_members;
drop table if exists import_sources;
