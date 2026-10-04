-- Отпечаток структуры public: сравнивает локальную и облачную базы. Только чтение.
select category, n, md5 from (
select 1 o, 'tables' category, count(*) n, md5(coalesce(string_agg(c.relname, ',' order by c.relname),'')) md5
  from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind in ('r','p')
union all
select 2, 'rls_enabled', count(*) filter (where c.relrowsecurity), md5(coalesce(string_agg(c.relname||':'||c.relrowsecurity, ',' order by c.relname),''))
  from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind='r'
union all
select 3, 'columns', count(*), md5(coalesce(string_agg(table_name||'.'||column_name||':'||data_type||':'||coalesce(udt_name,'')||':'||is_nullable||':'||coalesce(column_default,'')||':'||is_identity, ',' order by table_name, column_name),''))
  from information_schema.columns where table_schema='public'
union all
select 4, 'primary_keys', count(*), md5(coalesce(string_agg(conrelid::regclass::text||':'||pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname),''))
  from pg_constraint where contype='p' and connamespace='public'::regnamespace
union all
select 5, 'foreign_keys', count(*), md5(coalesce(string_agg(conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname),''))
  from pg_constraint where contype='f' and connamespace='public'::regnamespace
union all
select 6, 'unique_constraints', count(*), md5(coalesce(string_agg(conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname),''))
  from pg_constraint where contype='u' and connamespace='public'::regnamespace
union all
select 7, 'check_constraints', count(*), md5(coalesce(string_agg(conrelid::regclass::text||':'||conname||':'||pg_get_constraintdef(oid), ',' order by conrelid::regclass::text, conname),''))
  from pg_constraint where contype='c' and connamespace='public'::regnamespace
union all
select 8, 'indexes', count(*), md5(coalesce(string_agg(indexdef, ',' order by indexname),''))
  from pg_indexes where schemaname='public'
union all
select 9, 'policies', count(*), md5(coalesce(string_agg(tablename||':'||policyname||':'||cmd||':'||roles::text||':'||coalesce(qual,'')||':'||coalesce(with_check,''), ',' order by tablename, policyname),''))
  from pg_policies where schemaname='public'
union all
select 10, 'triggers', count(*), md5(coalesce(string_agg(tgname||':'||tgrelid::regclass::text||':'||pg_get_triggerdef(t.oid), ',' order by tgrelid::regclass::text, tgname),''))
  from pg_trigger t join pg_class c on c.oid=t.tgrelid where not tgisinternal and c.relnamespace='public'::regnamespace
union all
select 11, 'functions', count(*), md5(coalesce(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||md5(p.prosrc)||':'||p.prosecdef::text||':'||p.provolatile::text||':'||p.prokind::text, ',' order by p.proname, pg_get_function_identity_arguments(p.oid)),''))
  from pg_proc p where p.pronamespace='public'::regnamespace and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all
select 12, 'views', count(*), md5(coalesce(string_agg(viewname||':'||definition, ',' order by viewname),''))
  from pg_views where schemaname='public'
union all
select 13, 'enum_types', count(*), md5(coalesce(string_agg(typname||':'||labels, ',' order by typname),''))
  from (select t.typname, (select string_agg(e.enumlabel, '|' order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid) labels
        from pg_type t where t.typnamespace='public'::regnamespace and t.typtype='e') q
union all
select 14, 'table_grants', count(*), md5(coalesce(string_agg(c.relname||':'||r.rolname||':'||a.privilege_type, ',' order by c.relname, r.rolname, a.privilege_type),''))
  from pg_class c cross join lateral aclexplode(c.relacl) a join pg_roles r on r.oid=a.grantee
  where c.relnamespace='public'::regnamespace and c.relkind in ('r','v') and r.rolname in ('anon','authenticated')
union all
select 15, 'column_grants', count(*), md5(coalesce(string_agg(c.relname||'.'||att.attname||':'||r.rolname||':'||a.privilege_type, ',' order by c.relname, att.attname, r.rolname, a.privilege_type),''))
  from pg_class c join pg_attribute att on att.attrelid=c.oid cross join lateral aclexplode(att.attacl) a join pg_roles r on r.oid=a.grantee
  where c.relnamespace='public'::regnamespace and r.rolname in ('anon','authenticated')
union all
select 16, 'routine_grants', count(*), md5(coalesce(string_agg(p.proname||':'||coalesce(r.rolname,'PUBLIC')||':'||a.privilege_type, ',' order by p.proname, coalesce(r.rolname,'PUBLIC'), a.privilege_type),''))
  from pg_proc p cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a left join pg_roles r on r.oid=a.grantee
  where p.pronamespace='public'::regnamespace and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
    and (a.grantee=0 or r.rolname in ('anon','authenticated'))
union all
select 17, 'function_search_path', count(*), md5(coalesce(string_agg(p.proname||':'||coalesce(array_to_string(p.proconfig,';'),''), ',' order by p.proname, pg_get_function_identity_arguments(p.oid)),''))
  from pg_proc p where p.pronamespace='public'::regnamespace and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
union all
select 18, 'view_options', count(*), md5(coalesce(string_agg(c.relname||':'||coalesce(array_to_string(c.reloptions,';'),''), ',' order by c.relname),''))
  from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='v'
) z order by o;
