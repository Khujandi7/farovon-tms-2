-- Тесты HOTFIX M23: пакетная загрузка импорта (import_stage_begin/append/finish/abort). Только локально. Заканчивается намеренной ошибкой RESULT (откат).
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

alter table profiles alter constraint profiles_id_fkey deferrable initially deferred;
insert into profiles(id,full_name,role,is_active) values
  ('00000000-0000-0000-0000-00000000000a','Админ','ADMIN',true),('00000000-0000-0000-0000-00000000000e','Менеджер','ACADEMY_MANAGER',true),
  ('00000000-0000-0000-0000-00000000000c','Кадровик','HR',true),('00000000-0000-0000-0000-00000000000f','Финансист','FINANCE',true),
  ('00000000-0000-0000-0000-00000000000d','Наблюдатель','VIEWER',true);
insert into employees(canonical_id, full_name, name_norm, position, employee_code) values
  ('E-0951','Иванов Иван','иванов иван','Аналитик','D1'),('E-0952','Иванов Иван','иванов иван','Аудитор','D2');
delete from audit_log;

create or replace function pg_temp.kid(p_name text) returns text language sql as $$ select id from k where name = p_name $$;

-- строки: n штук с уникальными кодами и именами; from_no — номер первой строки в файле
create or replace function pg_temp.rows(p_from int, p_to int) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('row_no', n, 'raw', jsonb_build_object('ФИО', 'Фамилия'||translate(n::text,'0123456789','абвгдежзик')||' Имя'||translate((n*7)::text,'0123456789','лмнопрстуф')),
         'data', jsonb_build_object('employee_code', 'H-'||lpad(n::text,5,'0'), 'full_name', 'Фамилия'||translate(n::text,'0123456789','абвгдежзик')||' Имя'||translate((n*7)::text,'0123456789','лмнопрстуф'), 'position', 'Сотрудник')) order by n), '[]'::jsonb)
  from generate_series(p_from, p_to) n $$;
create or replace function pg_temp.begin_job(p_total int, p_token uuid) returns text language sql as $$
  select pg_temp.rv('C', format($q$select import_stage_begin('EMPLOYEES', 'XLSX', 'employees.xlsx', null, '{}'::jsonb, '{}'::jsonb, %s, %L)$q$, p_total, p_token)) $$;
create or replace function pg_temp.append(p_job text, p_rows jsonb) returns jsonb language sql as $$
  select pg_temp.rv('C', format($q$select import_stage_append(%L, %L::jsonb)::text$q$, p_job, p_rows))::jsonb $$;
create or replace function pg_temp.finish(p_job text) returns text language sql as $$
  select pg_temp.rv('C', format($q$select import_stage_finish(%L)$q$, p_job)) $$;

-- ====================== РАВНОСИЛЬНОСТЬ с import_stage ======================
-- 6 строк: 2 новые, 1 неоднозначная (Иванов Иван ×2 в справочнике), 1 повтор кода внутри файла, 1 строка без ФИО (ошибка)
create temp table mixed(rows jsonb);
insert into mixed select jsonb_build_array(
  jsonb_build_object('row_no',2,'raw','{"a":"1"}'::jsonb,'data','{"employee_code":"M-1","full_name":"Петров Пётр","position":"Мастер"}'::jsonb),
  jsonb_build_object('row_no',3,'raw','{"a":"2"}'::jsonb,'data','{"employee_code":"M-2","full_name":"Сидоров Сидор","position":"Оператор"}'::jsonb),
  jsonb_build_object('row_no',4,'raw','{"a":"3"}'::jsonb,'data','{"full_name":"Иванов Иван","position":"Кто-то"}'::jsonb),
  jsonb_build_object('row_no',5,'raw','{"a":"4"}'::jsonb,'data','{"employee_code":"M-1","full_name":"Петров Пётр Другой","position":"Повтор"}'::jsonb),
  jsonb_build_object('row_no',6,'raw','{"a":"5"}'::jsonb,'data','{"position":"Без имени"}'::jsonb));
insert into k select 'single', pg_temp.rv('C', format($q$select import_stage('EMPLOYEES','XLSX','employees.xlsx',null,'{}'::jsonb,'{}'::jsonb,%L::jsonb)$q$, (select rows from mixed)));
insert into k select 'chunk', pg_temp.begin_job(5, 'aaaaaaaa-0000-4000-8000-000000000001');

select pg_temp.append(pg_temp.kid('chunk'), (select jsonb_path_query_array(rows, '$[0 to 2]') from mixed));
select pg_temp.append(pg_temp.kid('chunk'), (select jsonb_path_query_array(rows, '$[3 to 4]') from mixed));
select pg_temp.ok(pg_temp.finish(pg_temp.kid('chunk')) = pg_temp.kid('chunk'), 'H1 finish возвращает то же задание');
select pg_temp.ok((select status from import_jobs where id = pg_temp.kid('chunk')::uuid) = 'STAGED', 'H2 после finish задание STAGED');
select pg_temp.ok(
  (select array_agg(row_no||':'||status order by row_no) from import_job_rows where job_id = pg_temp.kid('chunk')::uuid)
  = (select array_agg(row_no||':'||status order by row_no) from import_job_rows where job_id = pg_temp.kid('single')::uuid),
  'H3 статусы строк по частям = статусам одного import_stage (новые, неоднозначная, повтор, ошибка)');
select pg_temp.ok(
  (select array[new_rows, updated_rows, unchanged_rows, duplicate_rows, review_rows, error_rows, total_rows] from import_jobs where id = pg_temp.kid('chunk')::uuid)
  = (select array[new_rows, updated_rows, unchanged_rows, duplicate_rows, review_rows, error_rows, total_rows] from import_jobs where id = pg_temp.kid('single')::uuid),
  'H4 итоговые счётчики совпадают с import_stage');
select pg_temp.ok((select status from import_job_rows where job_id = pg_temp.kid('chunk')::uuid and row_no = 5) = 'DUPLICATE', 'H5 повтор кода между частями найден (DUPLICATE)');
select pg_temp.ok((select status from import_job_rows where job_id = pg_temp.kid('chunk')::uuid and row_no = 4) = 'NEEDS_REVIEW', 'H6 неоднозначное совпадение уходит на проверку, не сливается');
select pg_temp.ok(exists (select 1 from dq_issues where entity_table = 'import_jobs' and entity_id = pg_temp.kid('chunk') and status in ('OPEN','IN_REVIEW')), 'H7 для строки на проверку создано замечание DQ');
select pg_temp.ok((select count(*) from employees where employee_code like 'M-%') = 0, 'H8 до применения справочник не меняется');
select pg_temp.ok(pg_temp.finish(pg_temp.kid('chunk')) = pg_temp.kid('chunk'), 'H9 повторный finish безопасен');

-- ====================== ИДЕМПОТЕНТНОСТЬ begin / append ======================
insert into k select 'j2', pg_temp.begin_job(4, 'aaaaaaaa-0000-4000-8000-000000000002');
select pg_temp.ok(pg_temp.begin_job(4, 'aaaaaaaa-0000-4000-8000-000000000002') = pg_temp.kid('j2'), 'H10 повторный begin с тем же токеном возвращает то же задание');
select pg_temp.ok((select count(*) from import_jobs where options->>'client_token' = 'aaaaaaaa-0000-4000-8000-000000000002') = 1, 'H11 второго задания не создано');
select pg_temp.ok((pg_temp.append(pg_temp.kid('j2'), pg_temp.rows(1, 2)))->>'added' = '2', 'H12 первая часть: добавлено 2');
select pg_temp.ok((pg_temp.append(pg_temp.kid('j2'), pg_temp.rows(1, 2)))->>'skipped' = '2', 'H13 повтор той же части: пропущено 2, дублей нет');
select pg_temp.ok((select count(*) from import_job_rows where job_id = pg_temp.kid('j2')::uuid) = 2, 'H14 в задании ровно 2 строки после повтора');
select pg_temp.err_as('C', format($q$select import_stage_finish(%L)$q$, pg_temp.kid('j2')), 'H15 finish без всех строк отклоняется с понятным текстом', 'Загружено 2 из 4');
select pg_temp.err_as('C', format($q$select import_commit(%L)$q$, pg_temp.kid('j2')), 'H16 задание STAGING нельзя применить', 'P0015');
select pg_temp.err_as('C', format($q$select import_cancel(%L, 'тест')$q$, pg_temp.kid('j2')), 'H17 задание STAGING нельзя отменить как STAGED', 'P0015');
select pg_temp.err_as('C', format($q$select import_stage_append(%L, %L::jsonb)$q$, pg_temp.kid('j2'), pg_temp.rows(3, 6)), 'H18 строк больше заявленного — отклоняется', 'больше заявленного');
select pg_temp.err_as('E', format($q$select import_stage_append(%L, %L::jsonb)$q$, pg_temp.kid('j2'), pg_temp.rows(3, 3)), 'H19 чужое задание дополнять нельзя', 'не найден');
select pg_temp.err_as('E', format($q$select import_stage_finish(%L)$q$, pg_temp.kid('j2')), 'H20 чужое задание завершать нельзя', 'не найден');
select pg_temp.err_as('C', format($q$select import_stage_append(%L, %L::jsonb)$q$, pg_temp.kid('j2'), pg_temp.rows(1, 1001)), 'H21 часть больше 1000 строк отклоняется', 'Не больше 1000');
select pg_temp.ok(pg_temp.rv('C', format($q$select import_stage_abort(%L)$q$, pg_temp.kid('j2'))) = 'CANCELLED', 'H21a abort возвращает CANCELLED');
select pg_temp.ok((select status from import_jobs where id = pg_temp.kid('j2')::uuid) = 'CANCELLED', 'H22 прерванная загрузка отменяется');
select pg_temp.err_as('C', format($q$select import_stage_append(%L, %L::jsonb)$q$, pg_temp.kid('j2'), pg_temp.rows(3, 3)), 'H23 после отмены дополнять нельзя', 'завершена');

-- ====================== ПРАВА ======================
select pg_temp.err_as('F', $q$select import_stage_begin('EMPLOYEES','XLSX','f.xlsx',null,'{}','{}',1,'aaaaaaaa-0000-4000-8000-000000000003')$q$, 'H24 FINANCE не импортирует сотрудников', '42501');
select pg_temp.err_as('D', $q$select import_stage_begin('EMPLOYEES','XLSX','f.xlsx',null,'{}','{}',1,'aaaaaaaa-0000-4000-8000-000000000004')$q$, 'H25 VIEWER не импортирует', '42501');
select pg_temp.err_as('C', $q$select import_stage_begin('EMPLOYEES','XLSX','f.xlsx',null,'{}','{}',5001,'aaaaaaaa-0000-4000-8000-000000000005')$q$, 'H26 заявлено больше 5000 строк — отклоняется', 'Не больше 5000');
select pg_temp.err_as('C', $q$select import_stage_begin('EMPLOYEES','XLSX','f.xlsx',null,'{}','{}',0,'aaaaaaaa-0000-4000-8000-000000000006')$q$, 'H27 ноль строк — отклоняется', 'нет строк');
select pg_temp.ok(not has_function_privilege('anon', 'import_stage_begin(text, text, text, text, jsonb, jsonb, integer, uuid)', 'execute'), 'H28 anon не вызывает import_stage_begin');
select pg_temp.ok(not has_function_privilege('anon', 'import_stage_append(uuid, jsonb)', 'execute'), 'H29 anon не вызывает import_stage_append');
select pg_temp.ok(not has_function_privilege('anon', 'import_stage_finish(uuid)', 'execute'), 'H30 anon не вызывает import_stage_finish');

-- ====================== 2646 СОТРУДНИКОВ ======================
insert into k select 'big', pg_temp.begin_job(2646, 'aaaaaaaa-0000-4000-8000-000000000010');
select pg_temp.append(pg_temp.kid('big'), pg_temp.rows(s, least(s + 299, 2646))) from generate_series(1, 2646, 300) s;
select pg_temp.ok((select count(*) from import_job_rows where job_id = pg_temp.kid('big')::uuid) = 2646, 'H31 загружено 2646 строк девятью частями');
select pg_temp.finish(pg_temp.kid('big'));
select pg_temp.ok((select new_rows = 2646 and review_rows = 0 and error_rows = 0 and duplicate_rows = 0 from import_jobs where id = pg_temp.kid('big')::uuid), 'H32 2646 новых, без ошибок и дублей');
select pg_temp.rv('C', format($q$select import_commit(%L, 'тест 2646')$q$, pg_temp.kid('big')));
select pg_temp.ok((select count(*) from employees where employee_code like 'H-%') = 2646, 'H33 создано 2646 сотрудников');

-- повтор того же файла (новая загрузка): ничего не создаётся. ANALYZE — как после автоанализа в проде: без статистики планировщик уходит в seq scan.
analyze employees;
insert into k select 'again', pg_temp.begin_job(2646, 'aaaaaaaa-0000-4000-8000-000000000011');
select pg_temp.append(pg_temp.kid('again'), pg_temp.rows(s, least(s + 299, 2646))) from generate_series(1, 2646, 300) s;
select pg_temp.finish(pg_temp.kid('again'));
select pg_temp.ok((select unchanged_rows = 2646 and new_rows = 0 and updated_rows = 0 from import_jobs where id = pg_temp.kid('again')::uuid), 'H34 повторная загрузка файла: без изменений 2646, новых 0');
select pg_temp.rv('C', format($q$select import_commit(%L, 'повтор')$q$, pg_temp.kid('again')));
select pg_temp.ok((select count(*) from employees where employee_code like 'H-%') = 2646, 'H35 повторное применение не создаёт дубликатов');

do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
