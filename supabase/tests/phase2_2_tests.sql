-- Тесты Phase 2.2 (M9: защита собственного профиля, управление profiles). Только локально: используют DELETE и bootstrap.
-- Заканчивается намеренной ошибкой RESULT, поэтому ничего не сохраняется.

create temp table res(n serial, name text, ok boolean, detail text);

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin insert into res(name, ok) values (p_name, p_cond is true); end $$;

create or replace function pg_temp.expect_error(p_sql text, p_name text, p_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_like is not null and sqlerrm not like '%'||p_like||'%' then
      insert into res(name, ok, detail) values (p_name, false, 'другая ошибка: '||sqlerrm);
    else
      insert into res(name, ok) values (p_name, true);
    end if;
    return;
  end;
  insert into res(name, ok, detail) values (p_name, false, 'ожидалась ошибка, её не было');
end $$;

-- число строк под пользователем
create or replace function pg_temp.as_user(p_uid text, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute 'select count(*) from ('||p_sql||') q' into n;
  reset role;
  return n;
end $$;
-- скалярное значение (текст) под пользователем
create or replace function pg_temp.val_as(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  return v;
end $$;
-- выполнить команду под пользователем
create or replace function pg_temp.write_as(p_uid text, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

-- ---------- Данные ----------
alter table profiles alter constraint profiles_id_fkey deferrable initially deferred;
insert into profiles(id,full_name,role,is_active) values
  ('00000000-0000-0000-0000-00000000000a','Админ А','ADMIN',true),
  ('00000000-0000-0000-0000-000000000002','Админ Б','ADMIN',true),
  ('00000000-0000-0000-0000-000000000003','Бывший админ','ADMIN',false),
  ('00000000-0000-0000-0000-00000000000c','Кадровик','HR',true),
  ('00000000-0000-0000-0000-00000000000d','Наблюдатель','VIEWER',true),
  ('00000000-0000-0000-0000-00000000000e','Менеджер','ACADEMY_MANAGER',true);
delete from audit_log;

-- ====================== M9: самозащита ======================
select pg_temp.expect_error($e$select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$update profiles set role='VIEWER' where id='00000000-0000-0000-0000-00000000000a'$$)$e$,
  'M9 ADMIN не может понизить себя (даже при двух ADMIN)', 'собственную роль');
select pg_temp.expect_error($e$select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$update profiles set is_active=false where id='00000000-0000-0000-0000-00000000000a'$$)$e$,
  'M9 ADMIN не может деактивировать себя', 'собственную роль');
select pg_temp.expect_error($e$select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$update profiles set id='00000000-0000-0000-0000-0000000000aa' where id='00000000-0000-0000-0000-00000000000a'$$)$e$,
  'M9 нельзя сменить собственный id', 'собственную роль');
select pg_temp.expect_error($e$select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$delete from profiles where id='00000000-0000-0000-0000-00000000000a'$$)$e$,
  'M9 ADMIN не может удалить свой профиль', 'собственный профиль');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$update profiles set full_name='Админ А (ред.)' where id='00000000-0000-0000-0000-00000000000a'$$);
select pg_temp.ok((select full_name from profiles where id='00000000-0000-0000-0000-00000000000a')='Админ А (ред.)', 'M9 ADMIN может менять собственное ФИО');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$update profiles set role='ADMIN', is_active=true where id='00000000-0000-0000-0000-00000000000a'$$);
select pg_temp.ok(true, 'M9 update без фактического изменения role/is_active разрешён');

-- не-ADMIN: RLS не даёт менять профили; триггер не нужен, но итог тот же
select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', $$update profiles set role='ADMIN' where id='00000000-0000-0000-0000-00000000000d'$$);
select pg_temp.ok((select role from profiles where id='00000000-0000-0000-0000-00000000000d')='VIEWER', 'M9 VIEWER не повышает себе роль');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', $$update profiles set role='VIEWER' where id='00000000-0000-0000-0000-00000000000d'$$);
select pg_temp.ok((select role from profiles where id='00000000-0000-0000-0000-00000000000d')='VIEWER', 'M9 HR не меняет чужие профили');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $$update profiles set is_active=false where id='00000000-0000-0000-0000-00000000000d'$$);
select pg_temp.ok((select is_active from profiles where id='00000000-0000-0000-0000-00000000000d'), 'M9 ACADEMY_MANAGER не деактивирует других');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000d','select * from profiles')=6, 'M9 все роли читают profiles (список для интерфейса ADMIN)');

-- неактивный ADMIN теряет административные права
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-000000000003','select coalesce(app_role()::text,''none'')')='none', 'M9 неактивный ADMIN: app_role() = NULL');
select pg_temp.write_as('00000000-0000-0000-0000-000000000003', $$update profiles set role='ADMIN' where id='00000000-0000-0000-0000-00000000000c'$$);
select pg_temp.write_as('00000000-0000-0000-0000-000000000003', $$update profiles set full_name='взлом' where id='00000000-0000-0000-0000-00000000000d'$$);
select pg_temp.ok((select role from profiles where id='00000000-0000-0000-0000-00000000000c')='HR'
              and (select full_name from profiles where id='00000000-0000-0000-0000-00000000000d')='Наблюдатель', 'M9 неактивный ADMIN не может менять профили');

-- ADMIN управляет другими пользователями; аудит фиксирует актора
select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$update profiles set role='FINANCE' where id='00000000-0000-0000-0000-00000000000c'$$);
select pg_temp.ok((select role from profiles where id='00000000-0000-0000-0000-00000000000c')='FINANCE', 'M9 ADMIN меняет роль другому');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$update profiles set is_active=false where id='00000000-0000-0000-0000-00000000000c'$$);
select pg_temp.ok(not (select is_active from profiles where id='00000000-0000-0000-0000-00000000000c'), 'M9 ADMIN деактивирует другого');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000c','select * from trainings')=0
              and pg_temp.val_as('00000000-0000-0000-0000-00000000000c','select coalesce(app_role()::text,''none'')')='none', 'M9 деактивированный сразу теряет роль');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$update profiles set is_active=true where id='00000000-0000-0000-0000-00000000000c'$$);
select pg_temp.ok((select is_active from profiles where id='00000000-0000-0000-0000-00000000000c'), 'M9 ADMIN восстанавливает пользователя');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$insert into profiles(id,full_name,role) values ('00000000-0000-0000-0000-0000000000f1','Приглашённый','VIEWER')$$);
select pg_temp.ok(exists(select 1 from profiles where id='00000000-0000-0000-0000-0000000000f1' and role='VIEWER' and is_active), 'M9 ADMIN создаёт профиль приглашённого');
select pg_temp.expect_error($e$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', $$insert into profiles(id,full_name,role) values ('00000000-0000-0000-0000-0000000000f2','Самозванец','ADMIN')$$)$e$,
  'M9 VIEWER не создаёт профили');
select pg_temp.ok(exists(select 1 from audit_log where table_name='profiles' and action='UPDATE' and user_id='00000000-0000-0000-0000-00000000000a'
    and old_row->>'role'='HR' and new_row->>'role'='FINANCE' and row_id='00000000-0000-0000-0000-00000000000c'), 'M9 аудит: смена роли с актором');
select pg_temp.ok(exists(select 1 from audit_log where table_name='profiles' and action='UPDATE' and user_id='00000000-0000-0000-0000-00000000000a'
    and old_row->>'is_active'='true' and new_row->>'is_active'='false'), 'M9 аудит: деактивация с актором');
select pg_temp.ok(exists(select 1 from audit_log where table_name='profiles' and action='INSERT' and user_id='00000000-0000-0000-0000-00000000000a' and row_id='00000000-0000-0000-0000-0000000000f1'), 'M9 аудит: создание профиля с актором');

-- последний ADMIN: защита M1 работает независимо от M9 (действует администратор базы, auth.uid() = NULL)
select set_config('request.jwt.claim.sub','',true);
select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', $$update profiles set role='VIEWER' where id='00000000-0000-0000-0000-000000000002'$$);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.ok((select count(*) from profiles where role='ADMIN' and is_active)=1, 'M9 остался один активный ADMIN');
select pg_temp.expect_error($$update profiles set role='VIEWER' where id='00000000-0000-0000-0000-00000000000a'$$, 'M9 последнего ADMIN нельзя понизить (postgres)', 'последнего активного ADMIN');
select pg_temp.expect_error($$update profiles set is_active=false where id='00000000-0000-0000-0000-00000000000a'$$, 'M9 последнего ADMIN нельзя деактивировать (postgres)', 'последнего активного ADMIN');
select pg_temp.expect_error($$delete from profiles where id='00000000-0000-0000-0000-00000000000a'$$, 'M9 последнего ADMIN нельзя удалить (postgres)', 'последнего активного ADMIN');

-- service_role и postgres (auth.uid() IS NULL) триггером не блокируются
select pg_temp.ok(auth.uid() is null, 'M9 предпосылка: auth.uid() IS NULL вне сессии пользователя');
update profiles set role='ADMIN' where id='00000000-0000-0000-0000-000000000002';
select pg_temp.ok((select role from profiles where id='00000000-0000-0000-0000-000000000002')='ADMIN', 'M9 postgres меняет роль без блокировки');
set local role service_role;
update profiles set role='HR' where id='00000000-0000-0000-0000-000000000002';
reset role;
select pg_temp.ok((select role from profiles where id='00000000-0000-0000-0000-000000000002')='HR', 'M9 service_role меняет роль без блокировки');

-- bootstrap_first_admin продолжает работать, когда ADMIN нет
set local session_replication_role = replica;   -- обходим триггеры только ради подготовки сценария «ADMIN нет»
update profiles set role='VIEWER' where role='ADMIN';
set local session_replication_role = origin;
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000b0','boot@example.com');
select pg_temp.ok(bootstrap_first_admin('boot@example.com','Первый')='00000000-0000-0000-0000-0000000000b0'::uuid, 'M9 bootstrap_first_admin создаёт первого ADMIN');
select pg_temp.ok((select role||is_active::text from profiles where id='00000000-0000-0000-0000-0000000000b0')='ADMINtrue', 'M9 первый ADMIN активен');

-- привилегии и устройство
select pg_temp.ok(exists(select 1 from pg_trigger where tgname='profiles_self_protect' and tgrelid='public.profiles'::regclass and not tgisinternal), 'M9 триггер profiles_self_protect существует');
select pg_temp.ok(exists(select 1 from pg_trigger where tgname='profiles_guard' and tgrelid='public.profiles'::regclass), 'M9 profiles_guard (последний ADMIN) на месте');
select pg_temp.ok(not has_function_privilege('authenticated','public.trg_profiles_self_protect()','execute')
              and not has_function_privilege('anon','public.trg_profiles_self_protect()','execute')
              and not has_function_privilege('service_role','public.trg_profiles_self_protect()','execute'), 'M9 trg_profiles_self_protect недоступна authenticated/anon/service_role');
select pg_temp.ok((select proconfig::text from pg_proc where proname='trg_profiles_self_protect') like '%search_path=public, pg_temp%', 'M9 у функции задан search_path');
select pg_temp.ok(not (select prosecdef from pg_proc where proname='trg_profiles_self_protect'), 'M9 функция SECURITY INVOKER (auth.uid() реального вызывающего)');

-- ---------- Итог ----------
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
