-- Тесты HOTFIX M26: дозавершение применённого импорта сотрудников (пакетный разбор подразделений + применение разрешённых строк).
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
create or replace function pg_temp.rw(n int, code text, name text, dept text, unit text default null) returns jsonb language sql as $$
  select jsonb_build_object('row_no', n, 'raw', jsonb_build_object('ФИО', name),
    'data', jsonb_strip_nulls(jsonb_build_object('employee_code', code, 'full_name', name, 'position', 'Оператор', 'department', dept, 'unit', unit))) $$;

-- ====================== Подготовка: справочник и существующие сотрудники ======================
insert into k select 'main', pg_temp.rv('A', $q$select create_org_unit('{"name":"Основной департамент"}'::jsonb, 'тест')$q$);
insert into employees(canonical_id, full_name, name_norm, position, employee_code, department_id) values
  ('E-0990','Обновляемый Олег','обновляемый олег','Старая должность','X-1', null),
  ('E-0991','Неизменный Ник','неизменный ник','Оператор','X-2', (select id from org_units where name='Основной департамент')),
  ('E-0992','Двойной Тёзка','двойной тёзка','А','T1', null),('E-0993','Двойной Тёзка','двойной тёзка','Б','T2', null);
delete from audit_log;

-- Файл: 11 строк. Все подразделения неизвестны при загрузке (кроме r8 — без подразделения).
insert into k select 'job', pg_temp.stage_job('employees.xlsx', jsonb_build_array(
  pg_temp.rw(2,'R-1','Первый Новый','Новый департамент'),
  pg_temp.rw(3,'R-2','Второй Новый','Новый департамент'),
  pg_temp.rw(4,'R-3','Третий Алиасный','Алиасный департамент'),
  pg_temp.rw(5,'X-1','Обновляемый Олег','Основной департамент','Новый отдел'),
  pg_temp.rw(6,'X-2','Неизменный Ник','Старое имя департамента'),
  pg_temp.rw(7,'R-6','Шестой Нерешённый','Никогда не создадим'),
  pg_temp.rw(8,'R-8','Восьмой Без Подразделения', null),
  pg_temp.rw(9,'R-9','Девятый Пропущенный','Новый департамент'),
  pg_temp.rw(10,null,'Поздний Тёзка','Новый департамент'),
  pg_temp.rw(11,'R-11','Одиннадцатый Дубль','Новый департамент'),
  pg_temp.rw(12,'R-11','Одиннадцатый Дубль Повтор','Новый департамент')
), 'bbbbbbbb-0000-4000-8000-000000000001'::uuid);
select pg_temp.ok((select count(*)=9 from import_job_rows where job_id=pg_temp.kid('job')::uuid and review_code='UNIT_UNKNOWN' and status='NEEDS_REVIEW'), 'D0 9 строк с замечанием UNIT_UNKNOWN при загрузке');
-- решение пользователя «Пропустить» по строке 9 — до применения
select pg_temp.rv('C', format($q$select import_resolve_row(%s, 'SKIP')$q$, (select id from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=9)));
-- применяем как в Production: все спорные строки пропускаются
select pg_temp.rv('C', format($q$select import_commit_batch(%L::uuid, 500, 'Загрузка кадровой выгрузки')::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select status='COMMITTED' and inserted=1 and updated=0 and skipped=10 from import_jobs where id=pg_temp.kid('job')::uuid), 'D1 воспроизведено: применено COMMITTED, создан 1 (без подразделения), пропущено 10');
create temp table _before as select id, row_no, processed_at, apply_action, applied_id from import_job_rows where job_id=pg_temp.kid('job')::uuid;
create temp table _empc as select count(*) c from employees;
select pg_temp.ok((select count(*)=0 from employees where employee_code in ('R-1','R-2','R-3','R-6','R-9','R-11')), 'D1a ни одного из спорных сотрудников в базе нет');

-- ====================== Доступ и состояния ======================
select pg_temp.err_as('D', format($q$select import_resolved_preview(%L::uuid)$q$, pg_temp.kid('job')), 'D2 VIEWER не видит предпросмотр (RLS)', 'Импорт не найден');
select pg_temp.err_as('F', format($q$select import_apply_resolved_batch(%L::uuid, 50, 0, 'x')$q$, pg_temp.kid('job')), 'D2a FINANCE не применяет строки', 'Импорт не найден');
select pg_temp.err_as('C', format($q$select import_apply_resolved_batch(%L::uuid, 50, 0, null)$q$, pg_temp.kid('job')), 'D3 без причины (явного подтверждения) применение отклоняется', 'причину');
create temp table _pv0(j jsonb);
insert into _pv0 select pg_temp.rv('C', format($q$select import_resolved_preview(%L::uuid)::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'ready')::int=0 and (j->>'unresolved_units')::int=8 and (j->>'skipped_by_decision')::int=1 and (j->>'already_applied')::int=1 from _pv0), 'D4 до разбора: готовых 0, нерешённых подразделений 8, применено ранее 1');

-- ====================== Справочник исправлен: департамент, алиасы, отдел ======================
select pg_temp.rv('A', $q$select create_org_unit('{"name":"Новый департамент"}'::jsonb, 'из замечаний импорта')$q$);
select pg_temp.rv('A', format($q$select add_org_unit_alias(%s, 'Алиасный департамент', 'подтверждённое написание')$q$, pg_temp.kid('main')));
select pg_temp.rv('A', format($q$select add_org_unit_alias(%s, 'Старое имя департамента', 'подтверждённое написание')$q$, pg_temp.kid('main')));
select pg_temp.rv('A', $q$select create_org_units_bulk('[{"name":"Новый отдел","parent":"Основной департамент"}]'::jsonb, 'из замечаний импорта')::text$q$);

-- пакетный разбор курсором по 3 строки
create temp table _ra(n serial, j jsonb);
insert into _ra(j) select pg_temp.rv('C', format($q$select import_reanalyze_job(%L::uuid, 3, 0)::text$q$, pg_temp.kid('job')))::jsonb;
insert into _ra(j) select pg_temp.rv('C', format($q$select import_reanalyze_job(%L::uuid, 3, %s)::text$q$, pg_temp.kid('job'), (select (j->>'next_after') from _ra where n=1)))::jsonb;
insert into _ra(j) select pg_temp.rv('C', format($q$select import_reanalyze_job(%L::uuid, 3, %s)::text$q$, pg_temp.kid('job'), (select (j->>'next_after') from _ra where n=2)))::jsonb;
select pg_temp.ok((select (select sum((j->>'processed')::int) from _ra)=8 and (select bool_or((j->>'done')::boolean) from _ra) and (select sum((j->>'errors')::int) from _ra)=0), 'D5 пакетный разбор по 3 строки обработал все 8 строк UNIT_UNKNOWN без решения, без ошибок');
select pg_temp.ok((select sum((j->>'resolved')::int)=7 and sum((j->>'unresolved')::int)=1 from _ra), 'D5a разрешено 7 строк (созданные подразделения и алиасы), нерешённых 1 («Никогда не создадим»)');

-- повтор разбора идемпотентен: обрабатывается только оставшаяся нерешённая строка, решённые не трогаются, строка с решением SKIP не разбирается
create temp table _ra2(j jsonb);
insert into _ra2 select pg_temp.rv('C', format($q$select import_reanalyze_job(%L::uuid, 100, 0)::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'processed')::int=1 and (j->>'resolved')::int=0 and (j->>'unresolved')::int=1 and (j->>'done')::boolean from _ra2), 'D6 повторный пакетный разбор: только 1 нерешённая строка');
select pg_temp.ok((select status='NEEDS_REVIEW' and decision='SKIP' from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=9), 'D6a строка с решением пользователя «Пропустить» сохранила решение');

-- предпросмотр после разбора
create temp table _pv1(j jsonb);
insert into _pv1 select pg_temp.rv('C', format($q$select import_resolved_preview(%L::uuid)::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'ready')::int=7 and (j->>'ready_create')::int=5 and (j->>'ready_update')::int=2 and (j->>'unresolved_units')::int=1
                          and (j->>'needs_decision')::int=0 and (j->>'errors')::int=0 and jsonb_array_length(j->'sample')=7 from _pv1), 'D7 предпросмотр: готово 7 (создать 5, обновить 2), нерешённых 1, ошибок 0');
select pg_temp.ok((select jsonb_array_length(j->'unresolved_names')=1 and j->'unresolved_names'->0->>'name'='Никогда не создадим' and j->'unresolved_names'->0->>'kind'='DEPARTMENT' and (j->'unresolved_names'->0->>'rows')::int=1 from _pv1), 'D7c предпросмотр перечисляет отсутствующие названия подразделений с числом строк');
select pg_temp.ok((select jsonb_array_length(j->'unresolved_names')=5 and (j->'unresolved_names'->0->>'rows')::int=4 and j->'unresolved_names'->0->>'name'='Новый департамент'
                   and exists (select 1 from jsonb_array_elements(j->'unresolved_names') u where u->>'kind'='UNIT' and u->>'name'='Новый отдел') from _pv0), 'D4a до разбора: отсутствующие названия сгруппированы (Новый департамент ×4 и др.)');
select pg_temp.ok((select count(*)=(select c from _empc) from employees), 'D7a предпросмотр и разбор не создали сотрудников');
select pg_temp.ok((select count(*)=11 and bool_and(a.processed_at is not distinct from b.processed_at and a.apply_action is not distinct from b.apply_action and a.applied_id is not distinct from b.applied_id)
                   from import_job_rows a join _before b on b.id=a.id where a.job_id=pg_temp.kid('job')::uuid), 'D7b разбор не менял processed_at/apply_action/applied_id');

-- ====================== Изменения справочника сотрудников ДО применения ======================
-- (1) сотрудник с кодом R-2 успел появиться вручную → строка обновит его, а не создаст дубль
insert into employees(canonical_id, full_name, name_norm, position, employee_code) values ('E-0994','Ручной Вариант','ручной вариант','Кто-то','R-2');
-- (2) два одноимённых сотрудника «Поздний Тёзка» → строка 10 станет неоднозначной и не будет применена
insert into employees(canonical_id, full_name, name_norm, position) values ('E-0995','Поздний Тёзка',norm_name('Поздний Тёзка'),'А'),('E-0996','Поздний Тёзка',norm_name('Поздний Тёзка'),'Б');
-- (3) строка 4 получает невалидную дату → ошибка этой строки не должна останавливать пакет
update import_job_rows set data = data || '{"hire_date":"не дата"}'::jsonb where job_id=pg_temp.kid('job')::uuid and row_no=4;
create temp table _empc2 as select count(*) c from employees;
create temp table _audit0 as select count(*) c from audit_log;

-- ====================== Применение пакетами (по 3 строки) ======================
create temp table _ap(n serial, j jsonb);
insert into _ap(j) select pg_temp.rv('C', format($q$select import_apply_resolved_batch(%L::uuid, 3, 0, 'Дозавершение после исправления справочника')::text$q$, pg_temp.kid('job')))::jsonb;
insert into _ap(j) select pg_temp.rv('C', format($q$select import_apply_resolved_batch(%L::uuid, 3, %s, 'Дозавершение после исправления справочника')::text$q$, pg_temp.kid('job'), (select j->>'next_after' from _ap where n=1)))::jsonb;
insert into _ap(j) select pg_temp.rv('C', format($q$select import_apply_resolved_batch(%L::uuid, 3, %s, 'Дозавершение после исправления справочника')::text$q$, pg_temp.kid('job'), (select j->>'next_after' from _ap where n=2)))::jsonb;
select pg_temp.ok((select sum((j->>'created')::int)=2 and sum((j->>'updated')::int)=2 and sum((j->>'unchanged')::int)=1 and sum((j->>'needs_review')::int)=1 and sum((j->>'errors')::int)=1 from _ap),
                  'D8 итог трёх пакетов: создано 2, обновлено 2, без изменений 1, требует решения 1, ошибка 1');
select pg_temp.ok((select (j->>'done')::boolean and (j->>'remaining')::int=0 from _ap where n=3) and (select not (j->>'done')::boolean from _ap where n=1), 'D8a прогресс: первый пакет не завершён, последний done');
-- дубликаты
select pg_temp.ok((select count(*)=1 from employees where employee_code='R-2'), 'D9 дубль по табельному номеру не создан');
select pg_temp.ok((select r.apply_action='UPDATED' and r.applied_id=(select id from employees where employee_code='R-2') and r.reapplied_at is not null
                   from import_job_rows r where r.job_id=pg_temp.kid('job')::uuid and r.row_no=3), 'D9a строка с появившимся сотрудником обновила его (UPDATED), не создала нового');
select pg_temp.ok((select count(*)=2 from employees where full_name='Поздний Тёзка') and (select status='NEEDS_REVIEW' and review_code='EMPLOYEE_AMBIGUOUS' and applied_id is null and apply_action='SKIPPED'
                   from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=10), 'D10 неоднозначный сотрудник: ничего не создано, строка возвращена на проверку');
select pg_temp.ok((select count(*)=1 from dq_issues where fingerprint='IMPORT|'||pg_temp.kid('job')||'|'||(select id from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=10) and status='OPEN'), 'D10a по неоднозначной строке открыто замечание Data Quality');
-- частичный сбой
select pg_temp.ok((select apply_action='ERROR' and apply_error is not null and applied_id is null and reapplied_at is not null from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=4), 'D11 строка с ошибкой помечена ERROR, остальные применены');
select pg_temp.ok((select count(*)=0 from employees where employee_code='R-3'), 'D11a сотрудник упавшей строки не создан (подтранзакция откатилась)');
select pg_temp.ok((select count(*)=2 from employees where employee_code in ('R-1','R-11')), 'D11b соседние строки пакета применены: R-1, R-11 созданы');
-- без изменений
select pg_temp.ok((select status='UNCHANGED' and applied_id is null and reapplied_at is not null from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=6), 'D12 строка без отличий помечена UNCHANGED, сотрудник не менялся');
select pg_temp.ok((select count(*)=0 from audit_log where table_name='employees' and row_id=(select id::text from employees where employee_code='X-2') and action='UPDATE'), 'D12a сотрудник X-2 не обновлялся (нет записи аудита)');
-- нерешённая строка и решение пользователя
select pg_temp.ok((select applied_id is null and apply_action='SKIPPED' and status='NEEDS_REVIEW' from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=7), 'D13 нерешённая строка (подразделение так и не создано) не применена');
select pg_temp.ok((select applied_id is null and apply_action='SKIPPED' and decision='SKIP' from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=9) and (select count(*)=0 from employees where employee_code='R-9'), 'D13a строка с решением «Пропустить» не применена');
select pg_temp.ok((select apply_action='SKIPPED' and status='DUPLICATE' and applied_id is null from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=12), 'D13b дубликат внутри файла не применён');

-- повторный запуск с нуля: ошибочная строка берётся снова (после исправления данных), остальное не затрагивается
update import_job_rows set data = data - 'hire_date' where job_id=pg_temp.kid('job')::uuid and row_no=4;
create temp table _ap2(j jsonb);
insert into _ap2 select pg_temp.rv('C', format($q$select import_apply_resolved_batch(%L::uuid, 100, 0, 'Повтор после исправления строки 4')::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'processed')::int=1 and (j->>'created')::int=1 and (j->>'errors')::int=0 and (j->>'done')::boolean from _ap2), 'D14 повторный запуск: повторена только упавшая строка и создана');
select pg_temp.ok((select count(*)=1 from employees where employee_code='R-3'), 'D14a сотрудник R-3 создан ровно один раз');
-- идемпотентность
create temp table _ap3(j jsonb);
insert into _ap3 select pg_temp.rv('C', format($q$select import_apply_resolved_batch(%L::uuid, 100, 0, 'Повтор')::text$q$, pg_temp.kid('job')))::jsonb;
select pg_temp.ok((select (j->>'processed')::int=0 and (j->>'created')::int=0 and (j->>'updated')::int=0 and (j->>'done')::boolean from _ap3), 'D15 повтор после завершения ничего не делает (идемпотентно)');
select pg_temp.ok((select count(*)=(select c from _empc2) + 3 from employees), 'D15a всего создано ровно 3 сотрудника (R-1, R-11, R-3)');

-- ====================== История и счётчики ======================
select pg_temp.ok((select count(*)=11 and bool_and(a.processed_at is not distinct from b.processed_at) from import_job_rows a join _before b on b.id=a.id where a.job_id=pg_temp.kid('job')::uuid), 'D16 processed_at всех строк сохранён (история первого применения)');
select pg_temp.ok((select a.apply_action='CREATED' and a.reapplied_at is null and a.applied_id=b.applied_id and a.processed_at=b.processed_at
                   from import_job_rows a join _before b on b.id=a.id where a.job_id=pg_temp.kid('job')::uuid and a.row_no=8), 'D16a реально применённая ранее строка (8) не тронута');
select pg_temp.ok((select inserted=4 and updated=2 and skipped=5 and apply_errors=0 and status='COMMITTED' and conflicts=review_rows
                          and inserted=(select count(*) from import_job_rows x where x.job_id=j.id and x.apply_action='CREATED')
                          and updated=(select count(*) from import_job_rows x where x.job_id=j.id and x.apply_action='UPDATED')
                   from import_jobs j where j.id=pg_temp.kid('job')::uuid), 'D17 счётчики задания: добавлено 4, обновлено 2, пропущено 5, без ошибок; соответствуют строкам');
select pg_temp.ok((select count(*)>=3 from audit_log where table_name='employees' and action='INSERT' and reason like 'Дозавершение импорта%'), 'D18 создание сотрудников записано в аудит с причиной дозавершения');
select pg_temp.ok((select count(*)>=5 from source_records sr join source_files sf on sf.id=sr.source_file_id where sf.file_hash=pg_temp.kid('job')), 'D18a происхождение (lineage) записано для применённых строк');
select pg_temp.ok((select count(*)=0 from dq_issues where fingerprint like 'IMPORT|'||pg_temp.kid('job')||'|%' and status='OPEN' and details->>'row_id' not in
                   (select id::text from import_job_rows where job_id=pg_temp.kid('job')::uuid and (status='NEEDS_REVIEW'))), 'D18b замечания закрыты у всех строк, кроме оставшихся на проверке');

-- ====================== Состояния задания и безопасность ======================
insert into k select 'job_staged', pg_temp.stage_job('staged.xlsx', jsonb_build_array(pg_temp.rw(2,'S-1','Стейджд Тест','Основной департамент')), 'bbbbbbbb-0000-4000-8000-000000000002'::uuid);
select pg_temp.err_as('C', format($q$select import_apply_resolved_batch(%L::uuid, 10, 0, 'x')$q$, pg_temp.kid('job_staged')), 'D19 неприменённое (STAGED) задание: дозавершение не допускается', 'только для применённого');
update import_jobs set status='CANCELLED' where id=pg_temp.kid('job_staged')::uuid;
select pg_temp.err_as('C', format($q$select import_apply_resolved_batch(%L::uuid, 10, 0, 'x')$q$, pg_temp.kid('job_staged')), 'D19a отменённое задание не допускается', 'только для применённого');
select pg_temp.err_as('C', format($q$select import_reanalyze_job(%L::uuid, 10, 0)$q$, pg_temp.kid('job_staged')), 'D19b отменённое задание не разбирается', 'Импорт уже завершён');
select pg_temp.err_as('C', format($q$select import_apply_resolved_batch(%L::uuid, 1000, 0, 'x')$q$, pg_temp.kid('job')), 'D20 размер пакета ограничен', 'Размер пакета');
select pg_temp.ok((select bool_and(not prosecdef) from pg_proc where proname in ('import_reanalyze_job','import_resolved_preview','import_apply_resolved_batch','import_job_recount')), 'D21 новые рабочие функции — SECURITY INVOKER');
select pg_temp.ok((select prosecdef and proconfig @> array['search_path=public, pg_temp'] from pg_proc where proname='import_match_employees_fast'), 'D21a помощник сопоставления — DEFINER с фиксированным search_path');
select pg_temp.ok((select bool_and(proconfig @> array['search_path=public, pg_temp']) from pg_proc where proname in ('import_reanalyze_job','import_resolved_preview','import_apply_resolved_batch','import_job_recount','import_match_employees_fast')), 'D21b у всех функций задан search_path');
select pg_temp.ok((select not has_function_privilege('anon','import_apply_resolved_batch(uuid,integer,integer,text)','execute') and not has_function_privilege('anon','import_match_employees_fast(text,text)','execute')
                         and has_function_privilege('authenticated','import_apply_resolved_batch(uuid,integer,integer,text)','execute')), 'D21c права execute: authenticated — да, anon — нет');
select pg_temp.err_as('D', $q$select import_match_employees_fast('Иванов Иван', null)$q$, 'D22 VIEWER не пользуется помощником сопоставления', 'Недостаточно прав');

-- ====================== Итог ======================
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
