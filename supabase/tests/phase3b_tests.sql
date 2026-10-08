-- Тесты Phase 3B (M22): источники Google Sheets (идемпотентная синхронизация сотрудников, расхождения), обучение с участниками.
-- Только локально. Заканчивается намеренной ошибкой RESULT (откат).

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
insert into org_units(parent_id, name, level) values (null,'Производство','DEPARTMENT'), (null,'Финансы','DEPARTMENT');
insert into org_units(parent_id, name, level) select id,'Цех 1','UNIT' from org_units where name='Производство';
insert into employees(canonical_id, full_name, name_norm, position, employee_code) values
  ('E-0901','Иванов Иван','иванов иван','Аналитик','D1'),('E-0902','Иванов Иван','иванов иван','Аудитор','D2');
delete from audit_log;

-- стадия синхронизации: rows — массив {row_no, raw, data}; options.source_id — связь с источником
create or replace function pg_temp.stage(p_rows jsonb) returns text language sql as $$
  select pg_temp.rv('C', format($q$select import_stage('EMPLOYEES', 'GSHEET', 'Google Sheets: Кадры / Лист1', null, '{}'::jsonb, %L::jsonb, %L::jsonb)$q$,
         jsonb_build_object('source_id', pg_temp.kid('src')), p_rows)) $$;
create or replace function pg_temp.sync(p_rows jsonb) returns jsonb language plpgsql as $$
declare v_job text;
begin
  v_job := pg_temp.stage(p_rows);
  perform pg_temp.rv('C', format($q$select import_commit(%L, 'синхронизация')$q$, v_job));
  return pg_temp.rv('C', format($q$select record_source_sync(%L, %L)::text$q$, pg_temp.kid('src'), v_job))::jsonb;
end $$;
create or replace function pg_temp.row(n int, code text, name text, pos text, dept text default null, unit text default null) returns jsonb language sql as $$
  select jsonb_build_object('row_no', n, 'raw', jsonb_build_object('ФИО', name), 'data', jsonb_strip_nulls(jsonb_build_object('employee_code', code, 'full_name', name, 'position', pos, 'department', dept, 'unit', unit))) $$;

-- ====================== ИСТОЧНИК ======================
insert into k select 'src', pg_temp.rv('C', $q$select save_import_source('{"name":"Кадры","spreadsheet_id":"1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789","spreadsheet_url":"https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit","sheet_name":"Лист1","mapping":{"full_name":"ФИО","employee_code":"Таб. №"}}'::jsonb)$q$);
select pg_temp.ok((select last_status from import_sources where id = pg_temp.kid('src')::uuid) = 'NEVER', 'G1 HR сохраняет источник; статус NEVER');
select pg_temp.err_as('C', $q$select save_import_source('{"name":"Повтор","spreadsheet_id":"1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789","spreadsheet_url":"https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789","sheet_name":"Лист1"}'::jsonb)$q$, 'G2 тот же лист второй раз не сохраняется', 'P0015');
select pg_temp.err_as('F', $q$select save_import_source('{"name":"X","spreadsheet_id":"1AbCdEfGhIjKlMnOpQrStUvWxYz0123456780","spreadsheet_url":"https://docs.google.com/spreadsheets/d/x","sheet_name":"A"}'::jsonb)$q$, 'G3 FINANCE не сохраняет источники сотрудников', '42501');
select pg_temp.ok(pg_temp.rv('F', $q$select count(*)::text from import_sources$q$)::int = 0, 'G4 FINANCE не видит источники (RLS)');
select pg_temp.ok(pg_temp.rv('D', $q$select count(*)::text from import_sources$q$)::int = 0, 'G5 VIEWER не видит источники (RLS)');
select pg_temp.err_as('C', $q$select save_import_source('{"name":"Чужой","spreadsheet_id":"1AbCdEfGhIjKlMnOpQrStUvWxYz0123456781","spreadsheet_url":"https://evil.example.com/x","sheet_name":"A"}'::jsonb)$q$, 'G6 ссылка не на docs.google.com отклоняется', '23514');

-- ====================== СИНХРОНИЗАЦИЯ 1: новые ======================
create temp table sres(n int, stats jsonb);
insert into sres select 1, pg_temp.sync(jsonb_build_array(pg_temp.row(2,'T-1','Алиев Рустам','Мастер','Производство','Цех 1'), pg_temp.row(3,'T-2','Бобоев Сухроб','Оператор','Производство'), pg_temp.row(4,'T-3','Валиев Фарход','Бухгалтер','Финансы')));
select pg_temp.ok((select (stats->>'created')::int = 3 and stats->>'status' = 'SUCCESS' from sres where n = 1), 'G7 первая синхронизация: создано 3, статус SUCCESS');
select pg_temp.ok((select count(*) from import_source_members where source_id = pg_temp.kid('src')::uuid) = 3, 'G8 источник помнит 3 сотрудников');
select pg_temp.ok((select unit_id is not null from employees where employee_code = 'T-1'), 'G9 подразделение и отдел сопоставлены со справочником оргструктуры');
select pg_temp.ok(exists (select 1 from source_records r join source_files f on f.id = r.source_file_id where f.system = 'IMPORT:EMPLOYEES' and r.entity_table = 'employees'), 'G10 lineage: строки источника связаны с сотрудниками');

-- ====================== СИНХРОНИЗАЦИЯ 2: повтор — идемпотентность ======================
insert into k select 'emp_count', (select count(*)::text from employees);
insert into sres select 2, pg_temp.sync(jsonb_build_array(pg_temp.row(2,'T-1','Алиев Рустам','Мастер','Производство','Цех 1'), pg_temp.row(3,'T-2','Бобоев Сухроб','Оператор','Производство'), pg_temp.row(4,'T-3','Валиев Фарход','Бухгалтер','Финансы')));
select pg_temp.ok((select (stats->>'created')::int = 0 and (stats->>'updated')::int = 0 and (stats->>'unchanged')::int = 3 from sres where n = 2), 'G11 повтор: создано 0, обновлено 0, без изменений 3');
select pg_temp.ok((select count(*)::text from employees) = pg_temp.kid('emp_count'), 'G12 повтор не создаёт дубликатов сотрудников');

-- ====================== СИНХРОНИЗАЦИЯ 3: изменение и исчезновение ======================
insert into sres select 3, pg_temp.sync(jsonb_build_array(pg_temp.row(2,'T-1','Алиев Рустам','Старший мастер','Производство','Цех 1'), pg_temp.row(3,'T-2','Бобоев Сухроб','Оператор','Производство')));
select pg_temp.ok((select (stats->>'updated')::int = 1 and (stats->>'unchanged')::int = 1 and (stats->>'missing')::int = 1 from sres where n = 3), 'G13 обновлён 1, без изменений 1, исчез 1');
select pg_temp.ok((select "position" from employees where employee_code = 'T-1') = 'Старший мастер', 'G14 изменение в таблице обновляет существующего сотрудника');
select pg_temp.ok((select is_active from employees where employee_code = 'T-3'), 'G15 исчезнувший сотрудник не удалён и не деактивирован');
select pg_temp.ok(exists (select 1 from dq_issues where rule_code = 'SOURCE_EMPLOYEE_MISSING' and status = 'OPEN' and entity_id = (select id::text from employees where employee_code = 'T-3')), 'G16 расхождение с источником — замечание Data Quality');
select pg_temp.ok((select missing_since is not null from import_source_members m join employees e on e.id = m.employee_id where e.employee_code = 'T-3'), 'G17 отмечено, с какого момента сотрудника нет в источнике');

-- ====================== СИНХРОНИЗАЦИЯ 4: вернулся ======================
insert into sres select 4, pg_temp.sync(jsonb_build_array(pg_temp.row(2,'T-1','Алиев Рустам','Старший мастер','Производство','Цех 1'), pg_temp.row(3,'T-2','Бобоев Сухроб','Оператор','Производство'), pg_temp.row(4,'T-3','Валиев Фарход','Бухгалтер','Финансы')));
select pg_temp.ok((select (stats->>'missing')::int = 0 from sres where n = 4), 'G18 сотрудник вернулся в источник');
select pg_temp.ok(not exists (select 1 from dq_issues where rule_code = 'SOURCE_EMPLOYEE_MISSING' and status = 'OPEN'), 'G19 замечание о расхождении закрыто автоматически');
select pg_temp.rv('E', $q$select count(*)::text from dq_scan()$q$);
select pg_temp.ok((select count(*) from dq_issues where rule_code = 'SOURCE_EMPLOYEE_MISSING' and status = 'FIXED') = 1, 'G20 общая проверка dq_scan не трогает замечания источника');

-- ====================== НЕОДНОЗНАЧНОСТЬ И ДУБЛИКАТЫ ======================
insert into k select 'job_amb', pg_temp.stage(jsonb_build_array(pg_temp.row(2,null,'Иванов Иван','Аналитик'), pg_temp.row(3,'T-9','Петров Пётр','Юрист'), pg_temp.row(4,'T-9','Петров Пётр','Юрист')));
select pg_temp.ok((select status from import_job_rows where job_id = pg_temp.kid('job_amb')::uuid and row_no = 2) = 'NEEDS_REVIEW', 'G21 неоднозначное ФИО — ручная проверка, не автослияние');
select pg_temp.ok((select status from import_job_rows where job_id = pg_temp.kid('job_amb')::uuid and row_no = 4) = 'DUPLICATE', 'G22 повтор строки в таблице — дубликат');
select pg_temp.ok(pg_temp.rv('C', format($q$select record_source_sync(%L, %L)->>'status'$q$, pg_temp.kid('src'), pg_temp.kid('job_amb'))) = 'NEEDS_REVIEW', 'G23 источник получает статус «нужна проверка»');
select pg_temp.ok((select count(*) from employees where full_name = 'Петров Пётр') = 0, 'G24 до применения сотрудники не создаются');
insert into k select 'job_other', pg_temp.rv('C', $q$select import_stage('EMPLOYEES', 'CSV', 'x.csv', null, '{}'::jsonb, '{}'::jsonb, '[{"row_no":2,"raw":{},"data":{"full_name":"Кто-то"}}]'::jsonb)$q$);
select pg_temp.err_as('C', format($q$select record_source_sync(%L, %L)$q$, pg_temp.kid('src'), pg_temp.kid('job_other')), 'G25 чужой импорт к источнику не привязывается', 'P0015');
select pg_temp.err_as('F', format($q$select record_source_sync(%L, %L)$q$, pg_temp.kid('src'), pg_temp.kid('job_amb')), 'G26 FINANCE не записывает итоги синхронизации', '42501');
select pg_temp.ok((select last_status from import_sources where id = pg_temp.kid('src')::uuid) = 'NEEDS_REVIEW', 'G27 статус источника сохранён');

-- ====================== ОБУЧЕНИЕ С УЧАСТНИКАМИ ======================
insert into k select 'tr', pg_temp.rv('E', format($q$select create_training_with_participants('{"title":"Охрана труда","start_date":"2026-06-01","hours":8}'::jsonb, array[%L, %L, %L]::uuid[])$q$,
  (select id from employees where employee_code = 'T-1'), (select id from employees where employee_code = 'T-2'), (select id from employees where employee_code = 'T-1')));
select pg_temp.ok((select count(*) from training_participants where training_id = pg_temp.kid('tr')::uuid) = 2, 'P1 выбранные сотрудники стали участниками; повтор в выборе не дублирует');
select pg_temp.ok((select department_snapshot from training_participants p join employees e on e.id = p.employee_id where p.training_id = pg_temp.kid('tr')::uuid and e.employee_code = 'T-1') = 'Производство', 'P2 снимок подразделения на момент участия');
select pg_temp.err_as('C', $q$select create_training_with_participants('{"title":"X","start_date":"2026-06-01","hours":8}'::jsonb, '{}'::uuid[])$q$, 'P3 HR не создаёт обучение', '42501');
update employees set is_active = false where employee_code = 'T-3';
insert into k select 'tr_count', (select count(*)::text from trainings);
select pg_temp.err_as('E', format($q$select create_training_with_participants('{"title":"С неактивным","start_date":"2026-06-01","hours":8}'::jsonb, array[%L]::uuid[])$q$, (select id from employees where employee_code = 'T-3')), 'P4 неактивного сотрудника выбрать нельзя', 'P0015');
select pg_temp.ok((select count(*)::text from trainings) = pg_temp.kid('tr_count'), 'P5 при ошибке обучение не создаётся (одна транзакция)');
select pg_temp.err_as('E', $q$select create_training_with_participants('{"title":"Призрак","start_date":"2026-06-01","hours":8}'::jsonb, array['00000000-0000-4000-8000-000000000999']::uuid[])$q$, 'P6 несуществующего сотрудника выбрать нельзя (сотрудники не создаются из выбора)', 'P0015');
select pg_temp.ok(pg_temp.rv('E', format($q$select add_participants(%L, array[%L]::uuid[])::text$q$, pg_temp.kid('tr'), (select id from employees where employee_code = 'T-1')))::int = 0, 'P7 тот же сотрудник второй раз не добавляется');

-- из заявки: связь сохраняется, план остаётся планом
insert into k select 'req', pg_temp.rv('E', $q$select create_request('{"plan_year":2026,"topic":"Пожарная безопасность","participants_planned":30,"status":"APPROVED"}'::jsonb)$q$);
insert into k select 'tr2', pg_temp.rv('E', format($q$select create_training_with_participants(jsonb_build_object('title','Пожарная безопасность','start_date','2026-07-01','hours',4,'request_id',%L,'participants_planned',30), array[%L]::uuid[])$q$, pg_temp.kid('req'), (select id from employees where employee_code = 'T-2')));
select pg_temp.ok((select request_id::text || source_type::text from trainings where id = pg_temp.kid('tr2')::uuid) = pg_temp.kid('req') || 'PLANNED', 'P8 обучение из заявки: связь и тип «плановое»');
select pg_temp.ok((select participants_planned from trainings where id = pg_temp.kid('tr2')::uuid) = 30 and (select count(*) from training_participants where training_id = pg_temp.kid('tr2')::uuid) = 1, 'P9 план 30 остаётся планом, факт — из выбранных (1)');

-- участник → посещаемость → часы → досье
insert into k select 's1', pg_temp.rv('E', format($q$select upsert_session(%L, null, '{"start_date":"2026-06-01","hours":4}'::jsonb, null)$q$, pg_temp.kid('tr')));
insert into k select 's2', pg_temp.rv('E', format($q$select upsert_session(%L, null, '{"start_date":"2026-06-01","hours":4}'::jsonb, null)$q$, pg_temp.kid('tr')));
select pg_temp.ok((select count(*) from session_attendance a join training_participants p on p.id = a.participant_id where p.training_id = pg_temp.kid('tr')::uuid) = 4, 'P10 выбранные участники сразу доступны в посещаемости (2 участника × 2 захода)');
select pg_temp.ok(man_hours(pg_temp.kid('tr')::uuid) = 16, 'P11 часы считаются прежней логикой: 2 × 8 = 16');
select pg_temp.ok(pg_temp.rv('C', format($q$select events_count::text from employee_learning_summary(%L)$q$, (select id from employees where employee_code = 'T-1')))::int >= 1, 'P12 участие видно в досье сотрудника');
update employees set department_id = (select id from org_units where name = 'Финансы'), unit_id = null where employee_code = 'T-1';
select pg_temp.ok((select department_snapshot from training_participants p join employees e on e.id = p.employee_id where p.training_id = pg_temp.kid('tr')::uuid and e.employee_code = 'T-1') = 'Производство', 'P13 перевод сотрудника не переписывает историю участия');

-- права на функции
select pg_temp.ok(not has_function_privilege('anon', 'create_training_with_participants(jsonb, uuid[], text)', 'execute'), 'P14 anon не вызывает create_training_with_participants');
select pg_temp.ok(not has_function_privilege('anon', 'record_source_sync(uuid, uuid, text)', 'execute'), 'P15 anon не вызывает record_source_sync');
select pg_temp.ok(not has_table_privilege('anon', 'import_sources', 'select'), 'P16 anon не читает источники');

do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
