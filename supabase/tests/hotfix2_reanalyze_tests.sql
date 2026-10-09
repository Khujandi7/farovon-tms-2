-- Тесты HOTFIX M25: разбор строк UNIT_UNKNOWN в УЖЕ ПРИМЕНЁННОМ (COMMITTED) импорте сотрудников — состояние Production.
-- Только локально. Заканчивается ошибкой RESULT (откат).

create temp table res(n serial, name text, ok boolean, detail text);
create temp table k(name text primary key, id text);

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin insert into res(name, ok) values (p_name, p_cond is true); end $$;
create or replace function pg_temp.uid(r text) returns text language sql as $$
  select case r when 'A' then '00000000-0000-0000-0000-00000000000a' when 'E' then '00000000-0000-0000-0000-00000000000e'
                when 'C' then '00000000-0000-0000-0000-00000000000c' when 'F' then '00000000-0000-0000-0000-00000000000f'
                when 'D' then '00000000-0000-0000-0000-00000000000d' end $$;
create or replace function pg_temp.rv(r text, p_sql text) returns text language plpgsql as $$
declare v text;
begin perform set_config('request.jwt.claim.sub', pg_temp.uid(r), true); set local role authenticated; execute p_sql into v; reset role; return v; end $$;
create or replace function pg_temp.err_as(r text, p_sql text, p_name text, p_like text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', pg_temp.uid(r), true);
  set local role authenticated;
  begin execute p_sql;
  exception when others then
    reset role;
    if sqlerrm not like '%'||p_like||'%' and sqlstate <> p_like then
      insert into res(name, ok, detail) values (p_name, false, 'другая ошибка: '||sqlstate||' '||sqlerrm);
    else insert into res(name, ok) values (p_name, true); end if;
    return;
  end;
  reset role;
  insert into res(name, ok, detail) values (p_name, false, 'ожидалась ошибка, её не было');
end $$;
create or replace function pg_temp.kid(p_name text) returns text language sql as $$ select id from k where name = p_name $$;

alter table profiles alter constraint profiles_id_fkey deferrable initially deferred;
insert into profiles(id,full_name,role,is_active) values
  ('00000000-0000-0000-0000-00000000000a','Админ','ADMIN',true),('00000000-0000-0000-0000-00000000000e','Менеджер','ACADEMY_MANAGER',true),
  ('00000000-0000-0000-0000-00000000000c','Кадровик','HR',true),('00000000-0000-0000-0000-00000000000f','Финансист','FINANCE',true),
  ('00000000-0000-0000-0000-00000000000d','Наблюдатель','VIEWER',true);
delete from audit_log;


-- ====================== Состояние Production: задание применено, строки UNIT_UNKNOWN пропущены ======================
insert into k select 'dep', pg_temp.rv('A', $q$select create_org_unit('{"name":"Бройлерный департамент"}'::jsonb, 'тест')$q$);
insert into k select 'job', pg_temp.rv('A', $q$select import_stage('EMPLOYEES','XLSX','sotrudniki.xlsx', null, '{}'::jsonb, '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('row_no',2,'raw','{"ФИО":"Сидоров Семён"}'::jsonb,'data','{"full_name":"Сидоров Семён","employee_code":"H-1","department":"Снабжение и логистика"}'::jsonb),
    jsonb_build_object('row_no',3,'raw','{"ФИО":"Орлов Олег"}'::jsonb,'data','{"full_name":"Орлов Олег","employee_code":"H-2","department":"Бройлеры"}'::jsonb),
    jsonb_build_object('row_no',4,'raw','{"ФИО":"Мельников Макар"}'::jsonb,'data','{"full_name":"Мельников Макар","employee_code":"H-3","department":"Бройлерный департамент","unit":"Цех откорма"}'::jsonb)
  ))$q$);
insert into k select 'row2', (select id::text from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=2);
insert into k select 'row3', (select id::text from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=3);
insert into k select 'row4', (select id::text from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=4);
select pg_temp.ok((select count(*)=3 from import_job_rows where job_id=pg_temp.kid('job')::uuid and status='NEEDS_REVIEW' and review_code='UNIT_UNKNOWN'), 'H0 до применения: 3 строки NEEDS_REVIEW/UNIT_UNKNOWN');
-- применение пакетами, как в Production: строки без решения пропускаются
select pg_temp.rv('A', format($q$select import_commit_batch(%L::uuid, 500, 'Загрузка кадровой выгрузки')::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select status='COMMITTED' and inserted=0 and updated=0 and skipped=3 and conflicts=3 from import_jobs where id=pg_temp.kid('job')::uuid), 'H1 воспроизведено состояние Production: COMMITTED, добавлено 0, обновлено 0, пропущено 3, без решения 3');
select pg_temp.ok((select count(*)=3 from import_job_rows where job_id=pg_temp.kid('job')::uuid and status='NEEDS_REVIEW' and apply_action='SKIPPED'), 'H1a строки остались NEEDS_REVIEW и пропущены');
create temp table _emp as select count(*) c from employees;
create temp table _before as select id, apply_action, processed_at, applied_id from import_job_rows where job_id=pg_temp.kid('job')::uuid;

-- нерешённая строка в применённом задании: разбор допустим (раньше: «Импорт уже завершён»), остаётся на проверке
create temp table _re(j jsonb);
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row2')))::jsonb;
select pg_temp.ok((select not (j->>'resolved')::boolean and j->>'status'='NEEDS_REVIEW' from _re), 'H2 применённое задание: перепроверка без исправления справочника — строка остаётся на проверке, без ошибки');

-- 1) создаём департамент и перепроверяем
insert into k select 'dep3', pg_temp.rv('A', $q$select create_org_unit('{"name":"Снабжение и логистика"}'::jsonb, 'из замечания импорта')$q$);
delete from _re;
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row2')))::jsonb;
select pg_temp.ok((select (j->>'resolved')::boolean and j->>'status'='NEW' from _re), 'H3 после создания департамента строка в COMMITTED-задании разрешилась (NEW)');
select pg_temp.ok((select status='NEW' and review_code is null and (data->>'department_id')::bigint=pg_temp.kid('dep3')::bigint from import_job_rows where id=pg_temp.kid('row2')::bigint), 'H3a данные строки: department_id проставлен, review_code снят');
select pg_temp.ok((select count(*)=0 from dq_issues where fingerprint='IMPORT|'||pg_temp.kid('job')||'|'||pg_temp.kid('row2') and status in ('OPEN','IN_REVIEW')), 'H4 замечание Data Quality закрыто');

-- 2) подтверждённый алиас учитывается
select pg_temp.rv('A', format($q$select add_org_unit_alias(%s, 'Бройлеры', 'сопоставление из замечания импорта')$q$, pg_temp.kid('dep')));
delete from _re;
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row3')))::jsonb;
select pg_temp.ok((select status='NEW' and (data->>'department_id')::bigint=pg_temp.kid('dep')::bigint from import_job_rows where id=pg_temp.kid('row3')::bigint), 'H5 подтверждённый алиас учтён: строка разрешилась в нужный департамент');

-- 3) отдел внутри существующего департамента: создаём отдел и перепроверяем
select pg_temp.rv('A', $q$select create_org_units_bulk('[{"name":"Цех откорма","parent":"Бройлерный департамент"}]'::jsonb, 'из замечания импорта')::text$q$);
delete from _re;
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row4')))::jsonb;
select pg_temp.ok((select status='NEW' and review_code is null and (data->>'unit_id') is not null from import_job_rows where id=pg_temp.kid('row4')::bigint), 'H6 отдел создан и найден: unit_id проставлен');

-- 4) главное: ничего не применено автоматически, счётчики применения не тронуты
select pg_temp.ok((select count(*)=(select c from _emp) from employees), 'H7 сотрудники не созданы и не изменены');
select pg_temp.ok((select count(*)=3 and bool_and(a.apply_action is not distinct from b.apply_action and a.processed_at is not distinct from b.processed_at and a.applied_id is not distinct from b.applied_id)
                   from import_job_rows a join _before b on b.id=a.id where a.job_id=pg_temp.kid('job')::uuid), 'H7a apply_action/processed_at/applied_id строк не изменились');
select pg_temp.ok((select status='COMMITTED' and inserted=0 and updated=0 and skipped=3 and apply_errors=0 from import_jobs where id=pg_temp.kid('job')::uuid), 'H7b счётчики применения и статус задания не изменились');
select pg_temp.ok((select review_rows=0 and conflicts=0 and new_rows=3 from import_jobs where id=pg_temp.kid('job')::uuid), 'H8 счётчики разбора пересчитаны: на проверке 0, без решения 0, новых 3');

-- 5) идемпотентность
create temp table _snap as select data, status, messages from import_job_rows where id=pg_temp.kid('row2')::bigint;
delete from _re;
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row2')))::jsonb;
select pg_temp.ok((select (j->>'noop')::boolean and (j->>'resolved')::boolean from _re), 'H9 повтор на разрешённой строке — no-op');
select pg_temp.ok((select r.data=s.data and r.status=s.status and r.messages=s.messages from import_job_rows r, _snap s where r.id=pg_temp.kid('row2')::bigint), 'H9a no-op не меняет строку');

-- 6) права и запрещённые состояния
select pg_temp.err_as('D', format($q$select import_reanalyze_row(%s)$q$, pg_temp.kid('row3')), 'H10 VIEWER не разбирает строки (RLS)', 'Строка не найдена');
select pg_temp.err_as('F', format($q$select import_reanalyze_row(%s)$q$, pg_temp.kid('row3')), 'H10a FINANCE не разбирает строки импорта сотрудников', 'Строка не найдена');
insert into k select 'job2', pg_temp.rv('A', $q$select import_stage('EMPLOYEES','XLSX','otmena.xlsx', null, '{}'::jsonb, '{}'::jsonb,
  jsonb_build_array(jsonb_build_object('row_no',2,'raw','{"ФИО":"Тестов Тест"}'::jsonb,'data','{"full_name":"Тестов Тест","department":"Отменённый департамент"}'::jsonb)))$q$);
insert into k select 'row5', (select id::text from import_job_rows where job_id=pg_temp.kid('job2')::uuid and row_no=2);
update import_jobs set status='CANCELLED' where id=pg_temp.kid('job2')::uuid;
select pg_temp.err_as('A', format($q$select import_reanalyze_row(%s)$q$, pg_temp.kid('row5')), 'H11 отменённое задание по-прежнему не разбирается', 'Импорт уже завершён');
update import_jobs set status='COMMITTING' where id=pg_temp.kid('job2')::uuid;
select pg_temp.err_as('A', format($q$select import_reanalyze_row(%s)$q$, pg_temp.kid('row5')), 'H11a задание в процессе применения не разбирается (гонка с применением)', 'Импорт уже завершён');

-- 7) безопасность функции не ослаблена
select pg_temp.ok((select not prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where proname='import_reanalyze_row'), 'H12 функция остаётся SECURITY INVOKER с search_path');
select pg_temp.ok((select not has_function_privilege('anon','import_reanalyze_row(bigint)','execute') and has_function_privilege('authenticated','import_reanalyze_row(bigint)','execute')), 'H12a права execute: authenticated — да, anon — нет');

-- ====================== Итог ======================
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
