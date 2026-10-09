-- Тесты Phase 3C (M24): оргструктура (создание, иерархия, дубликаты, псевдонимы, массовое добавление) и разрешение
-- замечаний импорта «Подразделение не найдено» (import_reanalyze_row). Только локально. Заканчивается ошибкой RESULT (откат).

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

-- ====================== Создание и иерархия ======================
insert into k select 'dep', pg_temp.rv('A', $q$select create_org_unit('{"name":"Административно-хозяйственное управление"}'::jsonb, 'тест')$q$);
select pg_temp.ok((select level='DEPARTMENT' and parent_id is null and is_active from org_units where id = pg_temp.kid('dep')::bigint), 'C1 департамент создан (верхний уровень)');
insert into k select 'unit', pg_temp.rv('A', format($q$select create_org_unit('{"name":"Хозотдел","parent_id":%s}'::jsonb, 'тест')$q$, pg_temp.kid('dep')));
select pg_temp.ok((select level='UNIT' and parent_id = pg_temp.kid('dep')::bigint from org_units where id = pg_temp.kid('unit')::bigint), 'C2 отдел создан внутри департамента');
-- иерархия: родителем может быть только действующий департамент (не отдел) → цикл/самородительство структурно невозможны
select pg_temp.err_as('A', format($q$select create_org_unit('{"name":"Подотдел","parent_id":%s}'::jsonb, 'тест')$q$, pg_temp.kid('unit')), 'C3 отдел нельзя подчинить отделу (нет вложенности глубже 2 уровней)', 'департамент');
-- отдел нельзя переместить «под себя» (новый родитель должен быть департаментом)
select pg_temp.err_as('A', format($q$select move_org_unit(%s, %s, 'тест')$q$, pg_temp.kid('unit'), pg_temp.kid('unit')), 'C4 отдел нельзя сделать родителем самого себя', 'департамент');
select pg_temp.err_as('A', $q$select create_org_unit('{"name":"x"}'::jsonb, 'тест')$q$, 'C5 слишком короткое название отклоняется', 'название');
select pg_temp.err_as('F', $q$select create_org_unit('{"name":"Финансовый блок"}'::jsonb, 'тест')$q$, 'C6 FINANCE не создаёт подразделения', 'Недостаточно прав');
select pg_temp.err_as('D', $q$select create_org_unit('{"name":"Блок наблюдателя"}'::jsonb, 'тест')$q$, 'C7 VIEWER не создаёт подразделения', 'Недостаточно прав');

-- ====================== Псевдонимы (подтверждённые написания) ======================
insert into k select 'dep2', pg_temp.rv('A', $q$select create_org_unit('{"name":"Департамент бройлерного направления"}'::jsonb, 'тест')$q$);
select pg_temp.rv('A', format($q$select add_org_unit_alias(%s, 'Бройлерное направление', 'подтверждённое написание')$q$, pg_temp.kid('dep2')));
select pg_temp.ok((select find_org_units('Бройлерное направление', 'DEPARTMENT') = array[pg_temp.kid('dep2')::bigint]), 'A1 псевдоним находит подразделение при поиске');
-- то же написание нельзя закрепить за другим подразделением (разные не объединяются)
select pg_temp.err_as('A', format($q$select add_org_unit_alias(%s, 'Бройлерное направление', 'повтор')$q$, pg_temp.kid('dep')), 'A2 написание нельзя закрепить за вторым подразделением', 'уже закреплено');
select pg_temp.err_as('F', format($q$select add_org_unit_alias(%s, 'Любое', 'r')$q$, pg_temp.kid('dep2')), 'A3 FINANCE не добавляет псевдонимы', 'Недостаточно прав');
select pg_temp.err_as('A', format($q$select add_org_unit_alias(%s, 'Любое', '')$q$, pg_temp.kid('dep2')), 'A4 псевдоним требует причину', 'Укажите причину');

-- ====================== Массовое добавление ======================
select pg_temp.rv('A', $q$select (create_org_units_bulk('[
  {"name":"Служба качества"},
  {"name":"Служба качества"},
  {"name":"Лаборатория","parent":"Служба качества"},
  {"name":"q"},
  {"name":"Отдел без дома","parent":"Нет такого департамента"}
]'::jsonb, 'массовое добавление'))::text$q$);
select pg_temp.ok((select count(*) = 1 from org_units where name='Служба качества' and level='DEPARTMENT'), 'M1 департамент из пакета создан один раз (дубль пропущен)');
select pg_temp.ok((select count(*) = 1 from org_units u join org_units p on p.id=u.parent_id where u.name='Лаборатория' and p.name='Служба качества'), 'M2 отдел создан внутри нужного департамента');
-- JSON-ответ: created=2, skipped=1 (дубль), errors=2 (короткое имя + отсутствующий родитель)
create temp table _bulk(j jsonb);
insert into _bulk select pg_temp.rv('A', $q$select create_org_units_bulk('[
  {"name":"Отдел повтор","parent":"Служба качества"},
  {"name":"Отдел повтор","parent":"Служба качества"},
  {"name":"z"}
]'::jsonb, 'повтор')::text$q$)::jsonb;
select pg_temp.ok((select (j->>'created')::int=1 and (j->>'skipped')::int=1 and jsonb_array_length(j->'errors')=1 from _bulk), 'M3 ответ: создано 1, пропущено 1 (дубль), 1 ошибка');
select pg_temp.err_as('D', $q$select create_org_units_bulk('[{"name":"Блок"}]'::jsonb, 'r')$q$, 'M4 VIEWER не делает массовое добавление', 'Недостаточно прав');

-- ====================== Разрешение замечаний импорта ======================
-- Оба подразделения строк неизвестны на момент загрузки → обе строки на ручной проверке (UNIT_UNKNOWN).
insert into k select 'job', pg_temp.rv('A', $q$select import_stage('EMPLOYEES','XLSX','sotrudniki.xlsx', null, '{}'::jsonb, '{}'::jsonb,
  jsonb_build_array(
    jsonb_build_object('row_no',2,'raw','{"ФИО":"Сидоров Семён"}'::jsonb,'data','{"full_name":"Сидоров Семён","department":"Снабжение и логистика"}'::jsonb),
    jsonb_build_object('row_no',3,'raw','{"ФИО":"Орлов Олег"}'::jsonb,'data','{"full_name":"Орлов Олег","department":"Бройлеры"}'::jsonb)
  ))$q$);
insert into k select 'row2', (select id::text from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=2);
insert into k select 'row3', (select id::text from import_job_rows where job_id=pg_temp.kid('job')::uuid and row_no=3);
select pg_temp.ok((select status='NEEDS_REVIEW' and review_code='UNIT_UNKNOWN' from import_job_rows where id=pg_temp.kid('row2')::bigint), 'R1 строка с неизвестным подразделением → на проверке (UNIT_UNKNOWN)');
select pg_temp.ok((select status='OPEN' from dq_issues where fingerprint = 'IMPORT|'||pg_temp.kid('job')||'|'||pg_temp.kid('row2')), 'R2 по строке открыто замечание Data Quality');

-- 1) создаём недостающий департамент и повторно разбираем строку 2
insert into k select 'dep3', pg_temp.rv('A', $q$select create_org_unit('{"name":"Снабжение и логистика"}'::jsonb, 'создано из замечания импорта')$q$);
create temp table _re(j jsonb);
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row2')))::jsonb;
select pg_temp.ok((select (j->>'resolved')::boolean and j->>'status'='NEW' from _re where j->>'status' is not null limit 1), 'R3 после создания департамента строка разрешилась (NEW)');
select pg_temp.ok((select status='NEW' and review_code is null and (data->>'department_id')::bigint = pg_temp.kid('dep3')::bigint
                   from import_job_rows where id=pg_temp.kid('row2')::bigint), 'R4 строка обновлена: department_id проставлен, статус NEW');
select pg_temp.ok((select count(*)=0 from dq_issues where fingerprint = 'IMPORT|'||pg_temp.kid('job')||'|'||pg_temp.kid('row2') and status in ('OPEN','IN_REVIEW')), 'R5 замечание Data Quality закрыто');

-- 2) строка 3 — закрепляем подтверждённое написание «Бройлеры» за существующим департаментом, затем реанализ разрешает
select pg_temp.rv('A', format($q$select add_org_unit_alias(%s, 'Бройлеры', 'сопоставление из замечания импорта')$q$, pg_temp.kid('dep2')));
delete from _re;
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row3')))::jsonb;
select pg_temp.ok((select (data->>'department_id')::bigint = pg_temp.kid('dep2')::bigint and status='NEW' from import_job_rows where id=pg_temp.kid('row3')::bigint), 'R6 строка с подтверждённым написанием разрешилась в нужный департамент');

-- 3) реанализ на строке без UNIT_UNKNOWN отклоняется
select pg_temp.err_as('A', format($q$select import_reanalyze_row(%s)$q$, pg_temp.kid('row2')), 'R7 повторный разбор уже разрешённой строки отклоняется', 'не требуется разбор');
-- 4) реанализ без права
-- VIEWER не видит строки импорта (RLS can_import) → строка для него не найдена, как и в import_resolve_row
select pg_temp.err_as('D', format($q$select import_reanalyze_row(%s)$q$, pg_temp.kid('row3')), 'R8 VIEWER не разбирает строки импорта (строка скрыта RLS)', 'Строка не найдена');
-- 5) счётчики задания отражают реальность: обе строки стали NEW, на проверке 0
select pg_temp.ok((select review_rows=0 and new_rows=2 from import_jobs where id=pg_temp.kid('job')::uuid), 'R9 счётчики задания пересчитаны (на проверке 0, новых 2)');

-- ====================== Итог ======================
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
