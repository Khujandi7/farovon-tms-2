-- Миграция 0004: закрытие замечаний Supabase Security Advisor, относящихся к FAROVON TMS.
-- Архитектура и бизнес-правила не меняются: только права доступа, search_path и режим представления.

-- 1. Представление работает с правами того, кто его читает (иначе оно обходит RLS)
alter view public.v_dq_source_logic set (security_invoker = true);

-- 2. Фиксированный search_path у всех функций и процедур FAROVON TMS
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prokind in ('f','p')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter routine %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- 3. Анонимный (не вошедший в систему) доступ закрыт полностью
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on all tables in schema public from anon;
    revoke all on all sequences in schema public from anon;
    revoke all on all routines in schema public from anon;
    alter default privileges in schema public revoke all on tables from anon;
    alter default privileges in schema public revoke all on sequences from anon;
    alter default privileges in schema public revoke all on routines from anon;
  end if;
end $$;

-- 4. Функции: по умолчанию только вошедшие пользователи (authenticated) и сервис (service_role)
revoke execute on all routines in schema public from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on all routines in schema public to authenticated, service_role;
    revoke execute on function public.trg_audit(), public.trg_expense_fx(), public.trg_training_source_guard()
      from authenticated, service_role;
    revoke execute on procedure public.grant_table(text, app_role[], app_role[]) from authenticated, service_role;
  else
    grant execute on all routines in schema public to authenticated;
    revoke execute on function public.trg_audit(), public.trg_expense_fx(), public.trg_training_source_guard()
      from authenticated;
    revoke execute on procedure public.grant_table(text, app_role[], app_role[]) from authenticated;
  end if;
end $$;
