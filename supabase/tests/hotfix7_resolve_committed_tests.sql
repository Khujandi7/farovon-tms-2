-- Тесты HOTFIX M30: решения по сотрудникам в применённом импорте, массовые решения, применение решений пакетами.
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

create or replace function pg_temp.stage_job(p_name text, p_rows jsonb, p_token uuid) returns text language plpgsql as $$
declare v text;
begin
  v := pg_temp.rv('C', format($q$select import_stage_begin('EMPLOYEES','XLSX',%L, null, '{}'::jsonb, '{}'::jsonb, %s, %L)$q$, p_name, jsonb_array_length(p_rows), p_token));
  perform pg_temp.rv('C', format($q$select import_stage_append(%L, %L::jsonb)::text$q$, v, p_rows));
  perform pg_temp.rv('C', format($q$select import_stage_finish(%L)$q$, v));
  return v;
end $$;
create or replace function pg_temp.rw(n int, code text, name text) returns jsonb language sql as $$
  select jsonb_build_object('row_no', n, 'raw', jsonb_build_object('ФИО', name),
    'data', jsonb_strip_nulls(jsonb_build_object('employee_code', code, 'full_name', name, 'position', 'Оператор'))) $$;
create or replace function pg_temp.rid(p_job text, p_no int) returns bigint language sql as $$
  select id from import_job_rows where job_id = p_job::uuid and row_no = p_no $$;

-- ====================== Подготовка ======================
insert into employees(canonical_id, full_name, name_norm, position, employee_code) values
  ('E-0990','Иванов Иван Иванович',norm_name('Иванов Иван Иванович'),'Старая должность','X-1'),
  ('E-0991','Петров Пётр Петрович',norm_name('Петров Пётр Петрович'),'Старая должность','X-2'),
  ('E-0992','Сидоров Сидор Сергеевич',norm_name('Сидоров Сидор Сергеевич'),'Оператор','X-3'),
  ('E-0993','Кузнецов Кузьма Кузьмич',norm_name('Кузнецов Кузьма Кузьмич'),'Оператор','X-4'),
  ('E-0994','Орлов Олег Олегович',norm_name('Орлов Олег Олегович'),'Оператор','X-5');
insert into k select 'ivanov', id::text from employees where employee_code='X-1';
insert into k select 'petrov', id::text from employees where employee_code='X-2';
delete from audit_log;

-- Файл: 6 строк. 2–6: совпадение неточное (другое отчество) → EMPLOYEE_FUZZY, строка 7 — новый человек без совпадений.
insert into k select 'job', pg_temp.stage_job('employees.xlsx', jsonb_build_array(
  pg_temp.rw(2, null, 'Иванов Иван Иванов'),         -- создать нового
  pg_temp.rw(3, null, 'Петров Пётр Пётров'),          -- сопоставить с Петровым
  pg_temp.rw(4, null, 'Сидоров Сидор Семёнов'),       -- пропустить
  pg_temp.rw(5, null, 'Кузнецов Кузьма Кузнецов'),    -- массово «создать»
  pg_temp.rw(6, null, 'Орлов Олег Орлов'),            -- массово «создать», но потом появится точный тёзка → ошибка строки
  pg_temp.rw(7, 'N-1', 'Совсем Новый Человек')        -- обычная строка, применяется при загрузке
), 'cccccccc-0000-4000-8000-000000000001'::uuid);
select pg_temp.ok((select count(*)=5 from import_job_rows where job_id=pg_temp.kid('job')::uuid and status='NEEDS_REVIEW' and review_code='EMPLOYEE_FUZZY'), 'E0 пять строк EMPLOYEE_FUZZY при загрузке');
select pg_temp.ok((select status='NEW' from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=7), 'E0a строка 7 — обычная новая');

select pg_temp.rv('C', format($q$select import_commit_batch(%L::uuid, 500, 'Загрузка кадровой выгрузки')::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select status='COMMITTED' and inserted=1 and skipped=5 from import_jobs where id=pg_temp.kid('job')::uuid), 'E1 применено: создан 1, пропущено 5 (как в Production)');
create temp table _before as select id, row_no, status, processed_at, apply_action, applied_id from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=7;
create temp table _emp0 as select count(*) c from employees;
select pg_temp.ok((select count(*)=0 from employees where full_name in ('Иванов Иван Иванов','Петров Пётр Пётров','Сидоров Сидор Семёнов','Кузнецов Кузьма Кузнецов','Орлов Олег Орлов')), 'E1a спорных сотрудников в базе нет');

-- ====================== Права и условия ======================
select pg_temp.err_as('D', format($q$select import_resolve_row(%s, 'SKIP')$q$, pg_temp.rid(pg_temp.kid('job'), 4)), 'E2 VIEWER не может решать', 'Строка не найдена');
select pg_temp.err_as('F', format($q$select import_resolve_row(%s, 'SKIP')$q$, pg_temp.rid(pg_temp.kid('job'), 4)), 'E2a FINANCE не может решать', 'Строка не найдена');
select pg_temp.err_as('C', format($q$select import_resolve_row(%s, 'SKIP')$q$, pg_temp.rid(pg_temp.kid('job'), 7)), 'E3 применённую строку решать нельзя', 'Импорт уже завершён');
select pg_temp.err_as('C', format($q$select import_resolve_row(%s, 'MATCH')$q$, pg_temp.rid(pg_temp.kid('job'), 3)), 'E3a MATCH без сотрудника отклоняется', 'Выберите сотрудника');
select pg_temp.err_as('C', format($q$select import_resolve_row(%s, 'DELETE')$q$, pg_temp.rid(pg_temp.kid('job'), 3)), 'E3b неизвестное решение отклоняется', 'Неизвестное решение');

-- ====================== Решения по строкам в применённом импорте ======================
select pg_temp.rv('C', format($q$select import_resolve_row(%s, 'APPLY')$q$, pg_temp.rid(pg_temp.kid('job'), 2)));
select pg_temp.rv('C', format($q$select import_resolve_row(%s, 'MATCH', %L::uuid)$q$, pg_temp.rid(pg_temp.kid('job'), 3), pg_temp.kid('petrov')));
select pg_temp.rv('C', format($q$select import_resolve_row(%s, 'SKIP')$q$, pg_temp.rid(pg_temp.kid('job'), 4)));
select pg_temp.ok((select count(*)=3 from import_job_rows where job_id=pg_temp.kid('job')::uuid and decision is not null), 'E4 решения по 3 строкам сохранены в применённом импорте');
select pg_temp.ok((select decision_match=pg_temp.kid('petrov')::uuid from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=3), 'E4a сопоставление указывает на выбранного сотрудника');
select pg_temp.ok((select count(*)=(select c from _emp0) from employees), 'E4b решения не создали сотрудников');

-- ====================== Массовое решение ======================
select pg_temp.err_as('D', format($q$select import_resolve_rows_bulk(%L::uuid, 'APPLY')$q$, pg_temp.kid('job')), 'E5 VIEWER не делает массовых решений', 'Импорт не найден');
select pg_temp.err_as('C', format($q$select import_resolve_rows_bulk(%L::uuid, 'MATCH')$q$, pg_temp.kid('job')), 'E5a массовое «сопоставить» невозможно', 'Неизвестное решение');
select pg_temp.err_as('C', format($q$select import_resolve_rows_bulk(%L::uuid, 'APPLY', null, 501)$q$, pg_temp.kid('job')), 'E5b размер пакета > 500 отклоняется', 'Размер пакета');
create temp table _bk(j jsonb);
insert into _bk select pg_temp.rv('C', format($q$select import_resolve_rows_bulk(%L::uuid, 'APPLY')::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'changed')::int=2 and (j->>'remaining')::int=0 and (j->>'done')::boolean from _bk), 'E5c массово «создать»: затронуто только 2 строки без решения (5 и 6), остальные решения не перезаписаны');
select pg_temp.ok((select decision='MATCH' from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=3) and (select decision='SKIP' from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=4), 'E5d прежние решения (сопоставить, пропустить) не изменены массовой операцией');
-- чужие id игнорируются: другое задание
insert into k select 'job2', pg_temp.stage_job('other.xlsx', jsonb_build_array(pg_temp.rw(2, null, 'Орлов Олег Орлов')), 'cccccccc-0000-4000-8000-000000000002'::uuid);
create temp table _bk2(j jsonb);
insert into _bk2 select pg_temp.rv('C', format($q$select import_resolve_rows_bulk(%L::uuid, 'SKIP', array[%s]::bigint[])::text$q$, pg_temp.kid('job'), pg_temp.rid(pg_temp.kid('job2'), 2)))::jsonb;
select pg_temp.ok((select (j->>'changed')::int=0 from _bk2) and (select decision is null from import_job_rows where id=pg_temp.rid(pg_temp.kid('job2'), 2)), 'E5e строки другого задания массовой операцией не затрагиваются');
-- снять решение у одной строки и вернуть
create temp table _bk3(j jsonb);
insert into _bk3 select pg_temp.rv('C', format($q$select import_resolve_rows_bulk(%L::uuid, 'CLEAR', array[%s]::bigint[])::text$q$, pg_temp.kid('job'), pg_temp.rid(pg_temp.kid('job'), 5)))::jsonb;
select pg_temp.ok((select (j->>'changed')::int=1 from _bk3) and (select decision is null and decided_by is null from import_job_rows where id=pg_temp.rid(pg_temp.kid('job'), 5)), 'E5f «снять решение» очищает решение строки');
select pg_temp.rv('C', format($q$select import_resolve_rows_bulk(%L::uuid, 'APPLY', array[%s]::bigint[])::text$q$, pg_temp.kid('job'), pg_temp.rid(pg_temp.kid('job'), 5)));

create temp table _sm(j jsonb);
insert into _sm select pg_temp.rv('C', format($q$select import_decisions_summary(%L::uuid)::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'total')::int=5 and (j->>'undecided')::int=0 and (j->>'to_create')::int=3 and (j->>'to_match')::int=1 and (j->>'to_skip')::int=1 and (j->>'errors')::int=0 from _sm), 'E6 сводка: 5 строк, создать 3, сопоставить 1, пропустить 1, без решения 0');
select pg_temp.err_as('D', format($q$select import_decisions_summary(%L::uuid)$q$, pg_temp.kid('job')), 'E6a VIEWER не видит сводку', 'Импорт не найден');

-- ====================== Применение решений ======================
select pg_temp.err_as('C', format($q$select import_apply_decided_batch(%L::uuid, 50, 0, null)$q$, pg_temp.kid('job')), 'E7 без причины применение отклоняется', 'причину');
select pg_temp.err_as('F', format($q$select import_apply_decided_batch(%L::uuid, 50, 0, 'x')$q$, pg_temp.kid('job')), 'E7a FINANCE не применяет', 'Импорт не найден');
select pg_temp.err_as('D', format($q$select import_apply_decided_batch(%L::uuid, 50, 0, 'x')$q$, pg_temp.kid('job')), 'E7b VIEWER не применяет', 'Импорт не найден');
select pg_temp.err_as('C', format($q$select import_apply_decided_batch(%L::uuid, 301, 0, 'x')$q$, pg_temp.kid('job')), 'E7c размер пакета > 300 отклоняется', 'Размер пакета');
select pg_temp.ok((select count(*)=(select c from _emp0) from employees), 'E7d отклонённые вызовы ничего не создали');

-- появился точный тёзка строки 6 → «создать» должно отказаться (без дубля), остальные строки применяются
insert into employees(canonical_id, full_name, name_norm, position) values ('E-0995','Орлов Олег Орлов',norm_name('Орлов Олег Орлов'),'Появился потом');
create temp table _emp1 as select count(*) c from employees;
create temp table _audit0 as select count(*) c from audit_log;
create temp table _ap(n serial, j jsonb);
insert into _ap(j) select pg_temp.rv('C', format($q$select import_apply_decided_batch(%L::uuid, 2, 0, 'Решения по спорным сотрудникам')::text$q$, pg_temp.kid('job')))::jsonb;
insert into _ap(j) select pg_temp.rv('C', format($q$select import_apply_decided_batch(%L::uuid, 2, %s, 'Решения по спорным сотрудникам')::text$q$, pg_temp.kid('job'), (select j->>'next_after' from _ap where n=1)))::jsonb;
insert into _ap(j) select pg_temp.rv('C', format($q$select import_apply_decided_batch(%L::uuid, 2, %s, 'Решения по спорным сотрудникам')::text$q$, pg_temp.kid('job'), (select j->>'next_after' from _ap where n=2)))::jsonb;
select pg_temp.ok((select sum((j->>'created')::int)=2 and sum((j->>'updated')::int)=1 and sum((j->>'errors')::int)=1 and sum((j->>'processed')::int)=4 from _ap), 'E8 пакетами по 2 строки: создано 2, обновлено 1, ошибка 1 (дубль), обработано 4');
select pg_temp.ok((select bool_or((j->>'done')::boolean) from _ap) and (select (j->>'remaining')::int=0 from _ap where n=3), 'E8a курсор довёл до конца (done)');
select pg_temp.ok((select count(*)=(select c from _emp1)+2 from employees), 'E8b в справочнике ровно +2 сотрудника (дубль тёзки не создан)');
select pg_temp.ok((select count(*)=1 from employees where full_name='Иванов Иван Иванов') and (select count(*)=1 from employees where full_name='Кузнецов Кузьма Кузнецов'), 'E8c созданы Иванов Иван Иванов и Кузнецов Кузьма Кузнецов');
select pg_temp.ok((select count(*)=1 from employees where full_name='Орлов Олег Орлов'), 'E8d Орлов Олег Орлов остался один (тот, что появился позже)');
select pg_temp.ok((select full_name='Петров Пётр Пётров' from employees where id=pg_temp.kid('petrov')::uuid), 'E8e «сопоставить» обновил выбранного сотрудника, нового не создал');
select pg_temp.ok((select count(*)=0 from employees where full_name='Сидоров Сидор Семёнов'), 'E8f пропущенная строка не создала сотрудника');
select pg_temp.ok((select status='NEW' and apply_action='CREATED' and applied_id is not null and review_code is null and reapplied_at is not null from import_job_rows where id=pg_temp.rid(pg_temp.kid('job'), 2)), 'E9 строка 2: статус NEW, CREATED, applied_id заполнен, замечание снято');
select pg_temp.ok((select status='UPDATED' and apply_action='UPDATED' and applied_id=pg_temp.kid('petrov')::uuid from import_job_rows where id=pg_temp.rid(pg_temp.kid('job'), 3)), 'E9a строка 3: UPDATED, applied_id = выбранный сотрудник');
select pg_temp.ok((select status='NEEDS_REVIEW' and apply_action='ERROR' and apply_error like '%выберите «Сопоставить»%' and applied_id is null from import_job_rows where id=pg_temp.rid(pg_temp.kid('job'), 6)), 'E9b строка 6: ошибка с подсказкой «Сопоставить», не применена');
select pg_temp.ok((select status='NEEDS_REVIEW' and decision='SKIP' and applied_id is null and apply_action='SKIPPED' from import_job_rows where id=pg_temp.rid(pg_temp.kid('job'), 4)), 'E9c строка 4: остаётся пропущенной по решению');
select pg_temp.ok((select count(*)>=3 from audit_log) and (select count(*) from audit_log where reason like 'Решения по сотрудникам импорта «employees.xlsx»: Решения по спорным сотрудникам%')>=3, 'E10 в журнале изменений причина с названием файла и подтверждением пользователя');
select pg_temp.ok((select count(*)=1 from dq_issues where fingerprint='IMPORT|'||pg_temp.kid('job')||'|'||pg_temp.rid(pg_temp.kid('job'), 6) and status='OPEN'), 'E10a ошибка применения снова открыла замечание качества данных по строке 6');
select pg_temp.ok((select count(*)=0 from dq_issues where fingerprint='IMPORT|'||pg_temp.kid('job')||'|'||pg_temp.rid(pg_temp.kid('job'), 2) and status='OPEN'), 'E10b замечание по применённой строке 2 закрыто');
select pg_temp.ok((select count(*)=2 from source_records sr join source_files sf on sf.id=sr.source_file_id where sf.file_hash=pg_temp.kid('job') and sr.row_number in (2,3)), 'E10c происхождение (lineage) записано для строк 2 и 3');
select pg_temp.ok((select review_rows=2 and conflicts=2 and apply_errors=1 and inserted=3 and updated=1 from import_jobs where id=pg_temp.kid('job')::uuid), 'E11 счётчики задания пересчитаны: ждут решения 2, ошибок 1, создано 3, обновлено 1');
select pg_temp.ok((select a.status=b.status and a.processed_at is not distinct from b.processed_at and a.apply_action=b.apply_action and a.applied_id is not distinct from b.applied_id
                   from import_job_rows a join _before b on b.id=a.id), 'E11a ранее применённая строка 7 не изменилась');

-- повтор безопасен: применённые не берутся, ошибочная строка пробуется заново и снова отказывает, дублей нет
create temp table _rep(j jsonb);
insert into _rep select pg_temp.rv('C', format($q$select import_apply_decided_batch(%L::uuid, 50, 0, 'Повтор')::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'processed')::int=1 and (j->>'created')::int=0 and (j->>'updated')::int=0 and (j->>'errors')::int=1 from _rep) and (select count(*)=(select c from _emp1)+2 from employees), 'E12 повтор: обработана только ошибочная строка, новых сотрудников нет');
-- пользователь исправляет решение: «сопоставить» с тёзкой
select pg_temp.rv('C', format($q$select import_resolve_row(%s, 'MATCH', %L::uuid)$q$, pg_temp.rid(pg_temp.kid('job'), 6), (select id::text from employees where full_name='Орлов Олег Орлов' limit 1)));
create temp table _rep2(j jsonb);
insert into _rep2 select pg_temp.rv('C', format($q$select import_apply_decided_batch(%L::uuid, 50, 0, 'Исправлено решение')::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'updated')::int=1 and (j->>'errors')::int=0 and (j->>'done')::boolean from _rep2) and (select count(*)=(select c from _emp1)+2 from employees), 'E13 после исправления решения на «сопоставить» строка 6 применена, дублей нет');
select pg_temp.ok((select apply_error is null and apply_action='UPDATED' and status='UPDATED' from import_job_rows where id=pg_temp.rid(pg_temp.kid('job'), 6)), 'E13a ошибка строки 6 очищена');
select pg_temp.err_as('C', format($q$select import_resolve_row(%s, 'SKIP')$q$, pg_temp.rid(pg_temp.kid('job'), 2)), 'E14 применённую по решению строку менять нельзя', 'Импорт уже завершён');
create temp table _rep3(j jsonb);
insert into _rep3 select pg_temp.rv('C', format($q$select import_apply_decided_batch(%L::uuid, 50, 0, 'Ещё раз')::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'processed')::int=0 and (j->>'done')::boolean from _rep3), 'E15 ещё один запуск: делать нечего (processed = 0)');

-- ====================== До применения (STAGED) поведение прежнее; отменённое и чужое — нельзя ======================
select pg_temp.rv('C', format($q$select import_resolve_row(%s, 'SKIP')$q$, pg_temp.rid(pg_temp.kid('job2'), 2)));
select pg_temp.ok((select decision='SKIP' from import_job_rows where id=pg_temp.rid(pg_temp.kid('job2'), 2)), 'E16 в неприменённом задании (STAGED) решение работает как раньше');
select pg_temp.err_as('C', format($q$select import_apply_decided_batch(%L::uuid, 50, 0, 'x')$q$, pg_temp.kid('job2')), 'E16a применение решений доступно только после применения импорта', 'применённого импорта');
select pg_temp.rv('C', format($q$select import_cancel(%L::uuid, 'не нужен')$q$, pg_temp.kid('job2')));
select pg_temp.err_as('C', format($q$select import_resolve_rows_bulk(%L::uuid, 'SKIP')$q$, pg_temp.kid('job2')), 'E17 отменённое задание: массовые решения отклоняются', 'Импорт уже завершён');
select pg_temp.err_as('C', format($q$select import_resolve_row(%s, 'APPLY')$q$, pg_temp.rid(pg_temp.kid('job2'), 2)), 'E17a отменённое задание: решение по строке отклоняется', 'Импорт уже завершён');

-- ====================== Безопасность ======================
select pg_temp.ok(not has_function_privilege('anon', 'import_resolve_rows_bulk(uuid,text,bigint[],integer)', 'execute')
              and not has_function_privilege('anon', 'import_decisions_summary(uuid)', 'execute')
              and not has_function_privilege('anon', 'import_apply_decided_batch(uuid,integer,integer,text)', 'execute')
              and not has_function_privilege('anon', 'import_resolve_row(bigint,text,uuid)', 'execute'), 'X1 anon не может вызывать функции M30');
select pg_temp.ok(has_function_privilege('authenticated', 'import_apply_decided_batch(uuid,integer,integer,text)', 'execute'), 'X2 authenticated может вызывать применение решений');
select pg_temp.ok((select bool_and(not p.prosecdef) from pg_proc p where p.proname in ('import_resolve_rows_bulk','import_decisions_summary','import_apply_decided_batch','import_resolve_row')), 'X3 новые функции — SECURITY INVOKER (права и RLS вызывающего)');
select pg_temp.ok((select bool_and(p.proconfig::text like '%search_path%') from pg_proc p where p.proname in ('import_resolve_rows_bulk','import_decisions_summary','import_apply_decided_batch','import_resolve_row')), 'X4 у функций задан search_path');

-- ====================== Итог ======================
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
