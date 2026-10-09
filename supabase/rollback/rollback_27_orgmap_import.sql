-- Откат M27: удаляет функции массового сопоставления оргструктуры, триггер и таблицу import_org_mappings.
-- Созданные через сопоставление подразделения/псевдонимы остаются (обычные данные справочника, их изменения есть в audit_log);
-- сотрудники, доведённые по строкам, остаются. Сами строки импорта не меняются — исчезают только сопоставления задания.
drop table if exists import_org_mappings;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname = any (array['import_orgmap_parse', 'import_orgmap_similar', 'import_orgmap_scope_dept', 'import_orgmap_resolve', 'import_orgmap_check_target',
                               'trg_import_org_mappings_check', 'import_orgmap_scan', 'import_orgmap_apply', 'import_orgmap_reanalyze_batch']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
