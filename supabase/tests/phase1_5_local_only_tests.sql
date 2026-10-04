-- Тесты Phase 1.5, которые используют DELETE и заглушку auth.users. Запускаются ТОЛЬКО локально
-- (инструмент Supabase зависает на DELETE). Заканчиваются намеренной ошибкой RESULT (откат).

create temp table res(n serial, name text, ok boolean, detail text);
create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin insert into res(name, ok) values (p_name, p_cond is true); end $$;
create or replace function pg_temp.expect_error(p_sql text, p_name text, p_like text default null) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if p_like is not null and sqlerrm not like '%'||p_like||'%' then
      insert into res(name, ok, detail) values (p_name, false, 'другая ошибка: '||sqlerrm);
    else insert into res(name, ok) values (p_name, true); end if;
    return;
  end;
  insert into res(name, ok, detail) values (p_name, false, 'ожидалась ошибка, её не было');
end $$;
create or replace function pg_temp.write_as(p_uid text, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated; execute p_sql; reset role;
end $$;

insert into expense_categories(code,name,group_code) values ('FEE','Гонорар','TRAINER');
alter table profiles alter constraint profiles_id_fkey deferrable initially deferred;
insert into profiles(id,full_name,role) values
  ('00000000-0000-0000-0000-00000000000a','Админ','ADMIN'),
  ('00000000-0000-0000-0000-00000000000b','Финансист','FINANCE');

-- Удаление последнего ADMIN
select pg_temp.expect_error($$delete from profiles where id='00000000-0000-0000-0000-00000000000a'$$, 'L1 DELETE последнего ADMIN запрещён', 'последнего активного ADMIN');

-- Тренинги: DELETE
insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type)
values ('D-FACTS','С расходом','OFFLINE','INTERNAL',8,'2024-01-01','2024-01-01','COMPLETED','PLANNED'),
       ('D-EMPTY','Пустой','OFFLINE','INTERNAL',8,'2024-01-01','2024-01-01','PLANNED','PLANNED');
insert into expense_operations(training_id,category_id,amount,operation_date)
values ((select id from trainings where canonical_id='D-FACTS'),(select id from expense_categories where code='FEE'),100,'2024-01-01');
select pg_temp.expect_error($$delete from trainings where canonical_id='D-FACTS'$$, 'L2 DELETE тренинга с расходами запрещён', 'archive_training');
select pg_temp.ok((select count(*) from expense_operations)=1, 'L2 расход не пропал после попытки удаления тренинга');
delete from trainings where canonical_id='D-EMPTY';
select pg_temp.ok(not exists(select 1 from trainings where canonical_id='D-EMPTY'), 'L2 пустой тренинг удаляется физически');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000b','delete from expense_operations')$$, 'L2 FINANCE не может удалить расход (нет права DELETE)', 'permission denied');

-- Бюджет: DELETE
insert into budget_versions(name,fiscal_year) values ('Черновик',2040),('Утверждаемая',2041);
insert into budget_lines(version_id,topic,amount_usd) values
  ((select id from budget_versions where name='Утверждаемая'),'Л',10),
  ((select id from budget_versions where name='Черновик'),'Д',5);
update app_settings set value='11' where key='budget_fx_usd_tjs';
select approve_budget_version((select id from budget_versions where name='Утверждаемая'));
select pg_temp.expect_error($$delete from budget_versions where name='Утверждаемая'$$, 'L3 DELETE APPROVED версии запрещён', 'только DRAFT');
select pg_temp.expect_error($$delete from budget_lines where topic='Л'$$, 'L3 DELETE строки APPROVED версии запрещён', 'неизменяемы');
delete from budget_versions where name='Черновик';
select pg_temp.ok(not exists(select 1 from budget_versions where name='Черновик') and not exists(select 1 from budget_lines where topic='Д'), 'L3 DRAFT удаляется вместе со строками');

-- Bootstrap первого ADMIN: успешный путь. Снимаем защиту только внутри теста (replica).
set local session_replication_role = replica;
update profiles set role='VIEWER' where role='ADMIN';
set local session_replication_role = origin;
select pg_temp.expect_error($$select bootstrap_first_admin('nobody@example.com','Никто')$$, 'L4 bootstrap: неизвестный email', 'не найден');
insert into auth.users(id,email) values ('00000000-0000-0000-0000-0000000000aa','Boss@Example.com');
select bootstrap_first_admin('boss@example.com','Первый Админ');
select pg_temp.ok((select role::text||is_active::text from profiles where id='00000000-0000-0000-0000-0000000000aa')='ADMINtrue', 'L4 bootstrap создаёт ADMIN (email без учёта регистра)');
select pg_temp.expect_error($$select bootstrap_first_admin('boss@example.com','Ещё раз')$$, 'L4 повторный bootstrap отказывает', 'уже существует');
select pg_temp.ok(exists(select 1 from audit_log where table_name='profiles' and action='INSERT' and new_row->>'id'='00000000-0000-0000-0000-0000000000aa'), 'L4 bootstrap записан в аудит');

do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
