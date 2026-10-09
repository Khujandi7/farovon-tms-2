-- Откат M24 (Phase 3C): снимает функции управления оргструктурой и разрешения замечаний импорта.
-- Схема не менялась, поэтому откат — только удаление функций. Созданные подразделения и псевдонимы остаются
-- (это обычные данные справочника), как и в откатах других фаз.
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace
    and p.proname = any (array['add_org_unit_alias', 'import_reanalyze_row', 'create_org_units_bulk']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
