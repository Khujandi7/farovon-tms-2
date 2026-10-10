-- Тесты HOTFIX M27: массовое сопоставление оргструктуры и завершение импорта (контекстные сопоставления задания, скан, предпросмотр/применение, пакетный разбор).
-- Сценарий воспроизводит Production: задание COMMITTED, часть сотрудников уже создана, остальные строки ждут решения; названия из файла не совпадают
-- со справочником (другой родитель, несколько одинаковых названий в разных департаментах, неактивное, нет вообще), часть строк с кодом EMPLOYEE_*.
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
create or replace function pg_temp.rj(r text, p_sql text) returns jsonb language sql as $$ select pg_temp.rv(r, p_sql)::jsonb $$;
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
create or replace function pg_temp.dept(p text) returns bigint language sql as $$ select id from org_units where level='DEPARTMENT' and name=p $$;
create or replace function pg_temp.unit(d text, u text) returns bigint language sql as $$ select id from org_units where level='UNIT' and name=u and parent_id=pg_temp.dept(d) $$;
create or replace function pg_temp.job() returns uuid language sql as $$ select pg_temp.kid('job')::uuid $$;
create or replace function pg_temp.row_(n int) returns import_job_rows language sql as $$ select * from import_job_rows where job_id=pg_temp.job() and row_no=n $$;
create or replace function pg_temp.item(p_items jsonb, p_name text, p_action text) returns jsonb language sql as $$
  select i from jsonb_array_elements(p_items->'items') i where i->>'src_name'=p_name and i->>'action'=p_action limit 1 $$;
create or replace function pg_temp.grp(p_scan jsonb, p_kind text, p_name text, p_scope text) returns jsonb language sql as $$
  select g from jsonb_array_elements(p_scan->'groups_list') g where g->>'kind'=p_kind and g->>'src_name'=p_name and g->>'scope'=p_scope limit 1 $$;

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

-- ====================== Справочник: как в Production — названия из файла в справочнике отличаются ======================
select pg_temp.rv('A', $q$select create_org_unit('{"name":"Управление А"}'::jsonb, 'тест')$q$);
select pg_temp.rv('A', $q$select create_org_unit('{"name":"Управление Б"}'::jsonb, 'тест')$q$);
select pg_temp.rv('A', $q$select create_org_units_bulk('[
  {"name":"Отдел кадров","parent":"Управление А"},{"name":"Отдел кадров","parent":"Управление Б"},
  {"name":"Охрана труда","parent":"Управление А"},{"name":"Бухгалтерия","parent":"Управление Б"},{"name":"Склад","parent":"Управление А"}]'::jsonb, 'тест')::text$q$);
update org_units set is_active = false where name = 'Склад';
insert into employees(canonical_id, full_name, name_norm, position, employee_code) values
  ('E-0990','Обновляемый Олег','обновляемый олег','Старая должность','X-1'),
  ('E-0992','Двойной Тёзка',norm_name('Двойной Тёзка'),'А',null),('E-0993','Двойной Тёзка',norm_name('Двойной Тёзка'),'Б',null);
delete from audit_log;

-- Файл (18 строк). 2–4 разрешаются сразу и применяются (аналог 151 созданного), остальные ждут решения.
insert into k select 'job', pg_temp.stage_job('employees.xlsx', jsonb_build_array(
  pg_temp.rw(2,'A-1','Сотр Один','Управление А','Охрана труда'),
  pg_temp.rw(3,'A-2','Сотр Два','Управление Б','Бухгалтерия'),
  pg_temp.rw(4,'A-3','Сотр Три','управление  А','охрана ТРУДА'),
  pg_temp.rw(5,'K-1','Кадр Первый','Управление А','Кадры'),
  pg_temp.rw(6,'K-2','Кадр Второй','Управление А','Кадры'),
  pg_temp.rw(7,'K-3','Кадр Третий','Управление Б','Кадры'),
  pg_temp.rw(8,'H-1','Охрана Первый','Управление Б','Охрана труда'),
  pg_temp.rw(9,'H-2','Охрана Второй','Управление Б','Охрана труда'),
  pg_temp.rw(10,'I-1','Склад Первый','Управление А','Склад'),
  pg_temp.rw(11,'M-1','Новый Первый','Управление А','Новый цех'),
  pg_temp.rw(12,'M-2','Новый Второй','Управление А','Новый цех'),
  pg_temp.rw(13,'D-1','Деп Первый','Управление Х'),
  pg_temp.rw(14,'D-2','Деп Второй','Управление Х','Цех Х1'),
  pg_temp.rw(15,'P-1','Пар Первый','Управление А (Головное)','Отдел кадров'),
  pg_temp.rw(16,null,'Двойной Тёзка','Управление Б','Бухгалт'),
  pg_temp.rw(17,'S-1','Пропущенный','Управление А','Нет такого'),
  pg_temp.rw(18,'U-1','Неразрешимый','Управление Б','Загадка'),
  pg_temp.rw(19,'X-1','Обновляемый Олег','Управление А','Новый цех')
), 'cccccccc-0000-4000-8000-000000000001'::uuid);
select pg_temp.ok((select count(*)=3 and bool_and(status='NEW') from import_job_rows where job_id=pg_temp.job() and row_no in (2,3,4)), 'E0 строки 2–4 разрешились при загрузке');
select pg_temp.ok((select review_code='EMPLOYEE_AMBIGUOUS' and exists (select 1 from unnest(messages) m where m like 'Отдел «Бухгалт»%') from import_job_rows where job_id=pg_temp.job() and row_no=16),
                  'E0a строка 16: код EMPLOYEE_AMBIGUOUS перекрыл UNIT_UNKNOWN, замечание по отделу осталось в сообщениях');
select pg_temp.rv('C', format($q$select import_resolve_row(%s, 'SKIP')$q$, (select id from import_job_rows where job_id=pg_temp.job() and row_no=17)));
select pg_temp.rv('C', format($q$select import_commit_batch(%L::uuid, 500, 'Загрузка кадровой выгрузки')::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select status='COMMITTED' and inserted=3 and skipped=15 from import_jobs where id=pg_temp.job()), 'E1 воспроизведено: задание COMMITTED, создано 3, пропущено 15');
create temp table _emp0 as select id, canonical_id, full_name, updated_at, department_id, unit_id from employees where employee_code in ('A-1','A-2','A-3');
create temp table _before as select id, row_no, processed_at, apply_action, applied_id, decision from import_job_rows where job_id=pg_temp.job();
create temp table _empcount as select count(*) c from employees;
select pg_temp.ok((select count(*)=3 from _emp0), 'E1a три сотрудника созданы первым применением');

-- ====================== Первопричина: прежний разбор (M24–M26) не решает эти строки ======================
create temp table _old(j jsonb);
insert into _old select pg_temp.rj('C', format($q$select import_reanalyze_job(%L::uuid, 100, 0)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'processed')::int=13 and (j->>'resolved')::int=0 from _old), 'R1 прежний пакетный разбор: 13 строк UNIT_UNKNOWN обработано, ни одна не решена (в справочнике этих названий «нет»)');
select pg_temp.ok((select status='NEEDS_REVIEW' and exists (select 1 from unnest(messages) m where m like 'Отдел «Бухгалт»%') from pg_temp.row_(16)), 'R2 прежний разбор не трогает строку с кодом EMPLOYEE_* (замечание по отделу не разобрано)');
select pg_temp.ok(exists (select 1 from org_units where name='Охрана труда' and parent_id=pg_temp.dept('Управление А')) and (select status='NEEDS_REVIEW' from pg_temp.row_(8)),
                  'R3 отдел «Охрана труда» в справочнике ЕСТЬ (у Управления А), но строка 8 (Управление Б) не решается: поиск строго внутри департамента строки');
select pg_temp.rv('A', format($q$select add_org_unit_alias(%s, 'Кадры', 'подтверждённое написание')$q$, pg_temp.unit('Управление А','Отдел кадров')));
select pg_temp.err_as('A', format($q$select add_org_unit_alias(%s, 'Кадры', 'то же написание для другого департамента')$q$, pg_temp.unit('Управление Б','Отдел кадров')),
                      'R4 глобальный псевдоним нельзя закрепить за вторым отделом с тем же написанием', 'уже закреплено за другим');
insert into _old select pg_temp.rj('C', format($q$select import_reanalyze_job(%L::uuid, 100, 0)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'resolved')::int=2 and (j->>'unresolved')::int=11 from _old offset 1), 'R5 после псевдонима «Кадры» решены только строки 5–6 (Управление А); строка 7 (Управление Б) не решается — нужен контекст');

-- ====================== Скан: причины и кандидаты ======================
create temp table _scan(n serial, j jsonb);
insert into _scan(j) select pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 300, 0)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'groups')::int=10 and (j->>'rows_with_unit_issue')::int=12 from _scan where n=1), 'S1 скан: 10 уникальных значений, 12 строк с замечанием по подразделению (после псевдонима)');
select pg_temp.ok((select j->'by_cause'->'MISSING'->>'groups'='3' and j->'by_cause'->'OTHER_PARENT'->>'groups'='1' and j->'by_cause'->'INACTIVE'->>'groups'='1'
                          and j->'by_cause'->'PARENT_UNRESOLVED'->>'groups'='2' and j->'by_cause'->'SIMILAR'->>'groups'='2' and j->'by_cause'->'ALIAS_OTHER_PARENT'->>'groups'='1' from _scan where n=1), 'S2 причины: MISSING 3, OTHER_PARENT 1, INACTIVE 1, PARENT_UNRESOLVED 2, SIMILAR 2, ALIAS_OTHER_PARENT 1');
select pg_temp.ok((select exists (select 1 from jsonb_array_elements(j->'review_breakdown') b where b->>'code'='EMPLOYEE_AMBIGUOUS' and (b->>'with_unit_issue')::int=1)
                          and exists (select 1 from jsonb_array_elements(j->'review_breakdown') b where b->>'code'='UNIT_UNKNOWN' and (b->>'with_unit_issue')::int=(b->>'rows')::int) from _scan where n=1), 'S3 разбивка по review_code показывает строки EMPLOYEE_* с замечанием по отделу');
select pg_temp.ok((select (j->'protected'->>'applied')::int=3 and (j->'protected'->>'skipped_by_decision')::int=1 from _scan where n=1), 'S4 защищённые: применено 3, пропущено по решению 1 (в группы не попадают)');
select pg_temp.ok((select pg_temp.grp(j,'UNIT','Охрана труда','P:'||pg_temp.dept('Управление Б'))->>'cause'='OTHER_PARENT'
                          and (pg_temp.grp(j,'UNIT','Охрана труда','P:'||pg_temp.dept('Управление Б'))->'candidates'->0->>'allowed')::boolean=false
                          and pg_temp.grp(j,'UNIT','Охрана труда','P:'||pg_temp.dept('Управление Б'))->'candidates'->0->>'path'='Управление А › Охрана труда' from _scan where n=1),
                  'S5 «Охрана труда» у Управления Б: кандидат с полным путём «Управление А › Охрана труда» показан, но недоступен (другой департамент)');
select pg_temp.ok((select pg_temp.grp(j,'UNIT','Кадры','P:'||pg_temp.dept('Управление Б'))->>'cause'='ALIAS_OTHER_PARENT'
                          and (select count(*) from jsonb_array_elements(pg_temp.grp(j,'UNIT','Кадры','P:'||pg_temp.dept('Управление Б'))->'candidates') c where (c->>'allowed')::boolean)=1 from _scan where n=1),
                  'S6 «Кадры» в Управлении Б: написание закреплено за отделом Управления А (причина ALIAS_OTHER_PARENT), доступен к выбору один кандидат — отдел самого Управления Б');
select pg_temp.ok((select pg_temp.grp(j,'UNIT','Отдел кадров','D:управление а головное')->>'cause'='PARENT_UNRESOLVED'
                          and pg_temp.grp(j,'UNIT','Отдел кадров','D:управление а головное')->>'action'='DEPT_FIRST' from _scan where n=1), 'S7 отдел при ненайденном департаменте: «сначала департамент»');
select pg_temp.ok((select pg_temp.grp(j,'UNIT','Склад','P:'||pg_temp.dept('Управление А'))->>'cause'='INACTIVE' from _scan where n=1), 'S8 неактивный «Склад» определён как INACTIVE, а не «нет в справочнике»');
select pg_temp.err_as('D', format($q$select import_orgmap_scan(%L::uuid)$q$, pg_temp.kid('job')), 'S9 VIEWER не видит скан', 'Импорт не найден');

-- ====================== Предпросмотр = сохранение тем же кодом, ничего не пишет ======================
create temp table _items(j jsonb);
insert into _items select jsonb_build_array(
  jsonb_build_object('kind','DEPARTMENT','src_name','Управление Х','scope','','action','CREATE'),
  jsonb_build_object('kind','DEPARTMENT','src_name','Управление А (Головное)','scope','','action','MAP','org_unit_id',pg_temp.dept('Управление А')),
  jsonb_build_object('kind','UNIT','src_name','Цех Х1','scope','D:управление х','action','CREATE'),
  jsonb_build_object('kind','UNIT','src_name','Отдел кадров','scope','D:управление а головное','action','MAP','org_unit_id',pg_temp.unit('Управление А','Отдел кадров')),
  jsonb_build_object('kind','UNIT','src_name','Кадры','scope','P:'||pg_temp.dept('Управление Б'),'action','MAP','org_unit_id',pg_temp.unit('Управление Б','Отдел кадров')),
  jsonb_build_object('kind','UNIT','src_name','Новый цех','scope','P:'||pg_temp.dept('Управление А'),'action','CREATE'),
  jsonb_build_object('kind','UNIT','src_name','Охрана труда','scope','P:'||pg_temp.dept('Управление Б'),'action','CREATE','confirm_homonym',true));
create temp table _bad(j jsonb);
insert into _bad select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true, null)::text$q$, pg_temp.kid('job'), jsonb_build_array(
  jsonb_build_object('kind','UNIT','src_name','Охрана труда','scope','P:'||pg_temp.dept('Управление Б'),'action','MAP','org_unit_id',pg_temp.unit('Управление А','Охрана труда')),
  jsonb_build_object('kind','UNIT','src_name','Охрана труда','scope','P:'||pg_temp.dept('Управление Б'),'action','CREATE'),
  jsonb_build_object('kind','UNIT','src_name','Склад','scope','P:'||pg_temp.dept('Управление А'),'action','CREATE'),
  jsonb_build_object('kind','UNIT','src_name','Склад','scope','P:'||pg_temp.dept('Управление А'),'action','MAP','org_unit_id',(select id from org_units where name='Склад')),
  jsonb_build_object('kind','UNIT','src_name','Цех Х1','scope','D:управление х','action','MAP','org_unit_id',pg_temp.unit('Управление А','Отдел кадров')),
  jsonb_build_object('kind','UNIT','src_name','Кадры','scope','P:'||pg_temp.dept('Управление Б'),'action','ALIAS','org_unit_id',pg_temp.unit('Управление Б','Отдел кадров')),
  jsonb_build_object('kind','DEPARTMENT','src_name','Управление А (Головное)','scope','','action','MAP','org_unit_id',pg_temp.unit('Управление А','Отдел кадров'))))::text);
select pg_temp.ok((select (j->>'failed')::int=7 and (j->>'ok')::int=0 from _bad), 'P1 небезопасные действия отклонены все 7');
select pg_temp.ok((select pg_temp.item(j,'Охрана труда','MAP')->>'error' like '%другому департаменту%' from _bad), 'P1a отдел чужого департамента не привязывается (контекст)');
select pg_temp.ok((select exists (select 1 from jsonb_array_elements(j->'items') i where i->>'action'='CREATE' and i->>'src_name'='Охрана труда' and i->>'error' like '%у другого родителя%') from _bad), 'P1b создание отдела, имя которого есть у другого родителя, требует явного подтверждения');
select pg_temp.ok((select exists (select 1 from jsonb_array_elements(j->'items') i where i->>'src_name'='Склад' and i->>'action'='CREATE' and i->>'error' like '%уже есть%') and
                          exists (select 1 from jsonb_array_elements(j->'items') i where i->>'src_name'='Склад' and i->>'action'='MAP' and i->>'error' like '%неактивно%') from _bad), 'P1c существующее (в том числе неактивное) подразделение не дублируется');
select pg_temp.ok((select pg_temp.item(j,'Цех Х1','MAP')->>'error' like '%Сначала сопоставьте%' from _bad), 'P1d отдел без сопоставленного департамента не сопоставляется');
select pg_temp.ok((select pg_temp.item(j,'Кадры','ALIAS')->>'error' like '%уже закреплено за другим%' from _bad), 'P1e глобальный псевдоним, занятый другим отделом, отклонён (для этого случая — контекстное сопоставление)');
select pg_temp.ok((select exists (select 1 from jsonb_array_elements(j->'items') i where i->>'kind'='DEPARTMENT' and i->>'action'='MAP' and i->>'error' like '%Уровень%') from _bad), 'P1f отдел нельзя назначить как департамент (смена уровня не допускается)');
create temp table _dry(j jsonb);
insert into _dry select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true, null)::text$q$, pg_temp.kid('job'), (select j from _items)));
select pg_temp.ok((select (j->>'dry')::boolean and (j->>'ok')::int=7 and (j->>'failed')::int=0 and (j->>'created')::int=4 and (j->>'mapped')::int=3 from _dry), 'P2 предпросмотр: 7 из 7 допустимо (3 сопоставления, 4 создания; департамент создаётся раньше его отдела)');
select pg_temp.ok((select (j->>'rows_affected')::int=11 from _dry), 'P2a предпросмотр: затронуто строк 11 (Управление Х 2, Головное 1, Цех Х1 1, Отдел кадров 1, Кадры 1, Новый цех 3, Охрана труда 2)') ;
select pg_temp.ok((select count(*)=0 from import_org_mappings) and (select count(*) from org_units where name in ('Управление Х','Цех Х1','Новый цех'))=0
                   and (select count(*) from org_units where name='Охрана труда')=1, 'P3 предпросмотр ничего не записал (ни сопоставлений, ни подразделений)');
select pg_temp.err_as('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, null)$q$, pg_temp.kid('job'), (select j from _items)), 'P4 сохранение без причины отклоняется', 'причину');
select pg_temp.err_as('F', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true, null)$q$, pg_temp.kid('job'), (select j from _items)), 'P4a FINANCE не сопоставляет', 'Импорт не найден');
select pg_temp.err_as('C', format($q$select import_orgmap_apply(%L::uuid, '[]'::jsonb, true, null)$q$, pg_temp.kid('job')), 'P4b пустой список отклоняется', 'Нет значений');

-- ====================== Сохранение после подтверждения ======================
create temp table _sv(j jsonb);
insert into _sv select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'Сопоставление оргструктуры после сверки с кадрами')::text$q$, pg_temp.kid('job'), (select j from _items)));
select pg_temp.ok((select (j->>'ok')::int=7 and (j->>'failed')::int=0 and not (j->>'dry')::boolean from _sv), 'P5 сохранено 7 значений');
select pg_temp.ok((select count(*)=3 from import_org_mappings where job_id=pg_temp.job()), 'P5a сопоставлений в задании 3 (департамент, отдел в контексте, отдел при ненайденном департаменте)');
select pg_temp.ok((select count(*)=4 from org_units where name in ('Управление Х','Цех Х1','Новый цех') or (name='Охрана труда' and parent_id=pg_temp.dept('Управление Б'))), 'P5b создано 4 подразделения с правильными родителями');
select pg_temp.ok((select parent_id=pg_temp.dept('Управление Х') from org_units where name='Цех Х1') and (select parent_id=pg_temp.dept('Управление А') from org_units where name='Новый цех'), 'P5c родители новых отделов — департаменты из контекста файла');
select pg_temp.ok((select count(*)>=4 from audit_log where table_name='import_org_mappings' or (table_name='org_units' and action='INSERT')), 'P5d сопоставления и новые подразделения попали в аудит');
select pg_temp.ok((select bool_and(reason like 'Сопоставление оргструктуры импорта%') from audit_log where table_name='import_org_mappings'), 'P5e аудит хранит причину');
create temp table _orgc as select count(*) c from org_units;
create temp table _sv2(j jsonb);
insert into _sv2 select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'Повтор')::text$q$, pg_temp.kid('job'), (select j from _items)));
select pg_temp.ok((select (j->>'ok')::int=3 and (j->>'failed')::int=4 from _sv2) and (select count(*)=(select c from _orgc) from org_units) and (select count(*)=3 from import_org_mappings), 'P6 повтор идемпотентен: сопоставления не дублируются, подразделения не создаются повторно (создание отклонено как дубль)');
select pg_temp.ok((select bool_and(not (i->>'changed')::boolean) from jsonb_array_elements((select j from _sv2)->'items') i where i->>'action'='MAP'), 'P6a повторное сопоставление — без изменений');

-- Прямая запись в таблицу в обход функции подчиняется тем же инвариантам (триггер) и RLS
select pg_temp.err_as('C', format($q$insert into import_org_mappings(job_id,kind,src_name,src_norm,scope,org_unit_id,reason) values (%L,'UNIT','Охрана труда','охрана труда',%L,%s,'x')$q$,
                      pg_temp.kid('job'), 'P:'||pg_temp.dept('Управление Б'), pg_temp.unit('Управление А','Охрана труда')), 'P7 прямая вставка чужого департамента отклонена триггером', 'другому департаменту');
select pg_temp.err_as('D', format($q$insert into import_org_mappings(job_id,kind,src_name,src_norm,scope,org_unit_id,reason) values (%L,'DEPARTMENT','Управление А','управление а','',%s,'x')$q$, pg_temp.kid('job'), pg_temp.dept('Управление А')), 'P7a VIEWER не пишет сопоставления', 'недостаточно прав');
select pg_temp.ok((select pg_temp.rv('D', format($q$select count(*) from import_org_mappings where job_id=%L$q$, pg_temp.kid('job')))::int=0), 'P7b VIEWER не видит сопоставления');

-- ====================== Пакетный повторный разбор всех нерешённых строк ======================
create temp table _ra(n serial, j jsonb);
insert into _ra(j) select pg_temp.rj('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 4, 0)::text$q$, pg_temp.kid('job')));
insert into _ra(j) select pg_temp.rj('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 4, %s)::text$q$, pg_temp.kid('job'), (select j->>'next_after' from _ra where n=1)));
insert into _ra(j) select pg_temp.rj('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 4, %s)::text$q$, pg_temp.kid('job'), (select j->>'next_after' from _ra where n=2)));
insert into _ra(j) select pg_temp.rj('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 4, %s)::text$q$, pg_temp.kid('job'), (select j->>'next_after' from _ra where n=3)));
select pg_temp.ok((select sum((j->>'processed')::int)=12 and sum((j->>'resolved')::int)=9 and sum((j->>'unresolved')::int)=3 and sum((j->>'errors')::int)=0 and bool_or((j->>'done')::boolean) from _ra), 'A1 разбор по 4 строки: обработано 12, решено 9, осталось 3, ошибок 0');
select pg_temp.ok((select status='NEW' and data->>'unit_id'=pg_temp.unit('Управление Б','Отдел кадров')::text and data->>'department_id'=pg_temp.dept('Управление Б')::text from pg_temp.row_(7)),
                  'A2 строка 7: «Кадры» в Управлении Б → отдел кадров Управления Б (контекстное сопоставление)');
select pg_temp.ok((select status='NEW' and data->>'unit_id'=pg_temp.unit('Управление А','Отдел кадров')::text and data->>'department_id'=pg_temp.dept('Управление А')::text from pg_temp.row_(5)),
                  'A3 строка 5: «Кадры» в Управлении А → по псевдониму отдел Управления А (разные отделы с одним написанием не смешаны)');
select pg_temp.ok((select status='NEW' and data->>'unit_id'=pg_temp.unit('Управление А','Отдел кадров')::text and data->>'department_id'=pg_temp.dept('Управление А')::text and not exists (select 1 from unnest(messages) m where m like 'Подразделение «%не найдено')
                          from pg_temp.row_(15)), 'A4 строка 15: «Управление А (Головное)» → Управление А, отдел — Управления А, не чужой');
select pg_temp.ok((select status='NEW' and data->>'unit_id'=pg_temp.unit('Управление Б','Охрана труда')::text from pg_temp.row_(8)), 'A5 строка 8: у Управления Б создан собственный отдел «Охрана труда» — привязка к нему, не к отделу Управления А');
select pg_temp.ok((select status='UPDATED' and review_code is null and match_id is not null from pg_temp.row_(19)), 'A6 строка 19 (сотрудник с таким кодом уже есть) → UPDATED');
select pg_temp.ok((select status='NEEDS_REVIEW' and review_code='UNIT_UNKNOWN' and exists (select 1 from unnest(messages) m where m like 'Отдел «Склад»%') from pg_temp.row_(10)), 'A7 строка 10 (неактивный отдел) осталась нерешённой');
select pg_temp.ok((select status='NEEDS_REVIEW' and review_code='EMPLOYEE_AMBIGUOUS' and exists (select 1 from unnest(messages) m where m like 'Отдел «Бухгалт»%') from pg_temp.row_(16)), 'A8 строка 16: подразделение не найдено и осталась неоднозначность сотрудника — на ручной проверке');
select pg_temp.ok((select status='NEEDS_REVIEW' and decision='SKIP' from pg_temp.row_(17)) and (select status='NEEDS_REVIEW' from pg_temp.row_(18)), 'A9 строка с решением пользователя и «Загадка» не изменились');
select pg_temp.ok((select bool_and((data->>'unit_id') is null or (select parent_id from org_units where id=(data->>'unit_id')::bigint) = (data->>'department_id')::bigint) from import_job_rows where job_id=pg_temp.job() and status in ('NEW','UPDATED')),
                  'A10 ни у одной строки отдел не принадлежит чужому департаменту');
select pg_temp.ok((select count(*)=0 from employees where employee_code in ('K-1','K-2','K-3','H-1','H-2','M-1','M-2','D-1','D-2','P-1')), 'A11 разбор не создаёт сотрудников');
create temp table _ra5(j jsonb);
insert into _ra5 select pg_temp.rj('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 100, 0)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'processed')::int=3 and (j->>'resolved')::int=0 and (j->>'unresolved')::int=3 from _ra5), 'A12 повторный разбор идемпотентен: только 3 нерешённые строки');
select pg_temp.ok((select review_rows=3+0 and conflicts=review_rows from import_jobs where id=pg_temp.job()) or (select review_rows=4 from import_jobs where id=pg_temp.job()), 'A13 счётчик «на проверке» совпадает со строками (3 нерешённые + решение SKIP)');
select pg_temp.ok((select count(*)=1 from import_job_rows where job_id=pg_temp.job() and status='NEEDS_REVIEW' and decision is not null), 'A13a строка с решением пользователя остаётся одна');

-- ====================== Применение разрешённых строк (M26) без дублей ======================
create temp table _pv(j jsonb);
insert into _pv select pg_temp.rj('C', format($q$select import_resolved_preview(%L::uuid)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'ready')::int=11 and (j->>'ready_create')::int=10 and (j->>'ready_update')::int=1 and (j->>'already_applied')::int=3 from _pv), 'B1 предпросмотр M26: готово 11 (создать 10, обновить 1), уже применено 3');
update import_job_rows set data = data || '{"hire_date":"не дата"}'::jsonb where job_id=pg_temp.job() and row_no=9;   -- сбой одной строки
create temp table _ap(n serial, j jsonb);
insert into _ap(j) select pg_temp.rj('C', format($q$select import_apply_resolved_batch(%L::uuid, 4, 0, 'Дозавершение после сопоставления оргструктуры')::text$q$, pg_temp.kid('job')));
insert into _ap(j) select pg_temp.rj('C', format($q$select import_apply_resolved_batch(%L::uuid, 4, %s, 'Дозавершение после сопоставления оргструктуры')::text$q$, pg_temp.kid('job'), (select j->>'next_after' from _ap where n=1)));
insert into _ap(j) select pg_temp.rj('C', format($q$select import_apply_resolved_batch(%L::uuid, 4, %s, 'Дозавершение после сопоставления оргструктуры')::text$q$, pg_temp.kid('job'), (select j->>'next_after' from _ap where n=2)));
select pg_temp.ok((select sum((j->>'created')::int)=9 and sum((j->>'updated')::int)=1 and sum((j->>'errors')::int)=1 and bool_or((j->>'done')::boolean) from _ap), 'B2 пакеты по 4: создано 9, обновлён 1, ошибка 1 (строка 9), пакет не остановлен');
select pg_temp.ok((select count(*)=(select c from _empcount)+9 from employees), 'B3 сотрудников стало ровно +9 (без дублей)');
select pg_temp.ok((select bool_and(a.updated_at = b.updated_at and a.department_id is not distinct from b.department_id and a.unit_id is not distinct from b.unit_id and a.canonical_id=b.canonical_id)
                   from employees a join _emp0 b on b.id=a.id), 'B4 три ранее созданных сотрудника не изменены и не пересозданы');
select pg_temp.ok((select bool_and(a.processed_at is not distinct from b.processed_at) and count(*)=18 from import_job_rows a join _before b on b.id=a.id where a.job_id=pg_temp.job()), 'B5 processed_at (история первого применения) не изменён ни у одной строки');
select pg_temp.ok((select bool_and(a.apply_action is not distinct from b.apply_action and a.applied_id is not distinct from b.applied_id) from import_job_rows a join _before b on b.id=a.id where a.job_id=pg_temp.job() and b.apply_action in ('CREATED','UPDATED')), 'B5a ранее применённые строки (CREATED/UPDATED) не изменены');
select pg_temp.ok((select apply_action='SKIPPED' and applied_id is null from pg_temp.row_(17)) and (select apply_action='SKIPPED' and applied_id is null from pg_temp.row_(16)) and (select apply_action='SKIPPED' and applied_id is null from pg_temp.row_(10)), 'B6 не применены: решение пользователя, неоднозначный сотрудник, неразрешённое подразделение');
select pg_temp.ok((select e.unit_id=pg_temp.unit('Управление Б','Отдел кадров') and e.department_id=pg_temp.dept('Управление Б') from employees e where e.employee_code='K-3'), 'B7 сотрудник из Управления Б сохранён в отделе кадров Управления Б');
select pg_temp.ok((select position='Оператор' and unit_id=pg_temp.unit('Управление А','Новый цех') from employees where employee_code='X-1'), 'B7a существующий сотрудник X-1 обновлён (не дублирован)');
select pg_temp.ok((select apply_action='ERROR' and reapplied_at is not null from pg_temp.row_(9)), 'B8 строка со сбоем помечена ERROR');
update import_job_rows set data = data - 'hire_date' where job_id=pg_temp.job() and row_no=9;   -- сбой устранён
create temp table _ap2(j jsonb);
insert into _ap2 select pg_temp.rj('C', format($q$select import_apply_resolved_batch(%L::uuid, 50, 0, 'Повтор после сбоя')::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'created')::int=1 and (j->>'updated')::int=0 and (j->>'errors')::int=0 and (j->>'processed')::int=1 from _ap2), 'B9 возобновление с нуля: досоздана только упавшая строка');
create temp table _ap3(j jsonb);
insert into _ap3 select pg_temp.rj('C', format($q$select import_apply_resolved_batch(%L::uuid, 50, 0, 'Повтор того же')::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'processed')::int=0 and (j->>'created')::int=0 from _ap3) and (select count(*)=(select c from _empcount)+10 from employees), 'B10 повтор того же пакета ничего не создаёт: сотрудников ровно +10');
select pg_temp.ok((select count(*)=count(distinct lower(employee_code)) from employees where employee_code is not null), 'B10a дублей табельных номеров нет');
select pg_temp.ok((select inserted=(select count(*) from import_job_rows where job_id=pg_temp.job() and apply_action='CREATED')
                          and updated=(select count(*) from import_job_rows where job_id=pg_temp.job() and apply_action='UPDATED')
                          and skipped=(select count(*) from import_job_rows where job_id=pg_temp.job() and apply_action='SKIPPED')
                          and apply_errors=0 and conflicts=(select count(*) from import_job_rows where job_id=pg_temp.job() and status='NEEDS_REVIEW')
                          and inserted=13 and updated=1 from import_jobs where id=pg_temp.job()), 'B11 счётчики задания совпадают с фактическими строками (создано 13 = 3+10, обновлено 1)');
create temp table _pv2(j jsonb);
insert into _pv2 select pg_temp.rj('C', format($q$select import_resolved_preview(%L::uuid)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'ready')::int=0 and (j->>'completed_now')::int=11 and (j->>'already_applied')::int=3 and (j->>'unresolved_units')::int=2 and (j->>'needs_decision')::int=1 and (j->>'skipped_by_decision')::int=1 from _pv2), 'B12 итог: готово 0, доведено 11, ранее 3, нерешённых подразделений 2, сотрудник на решении 1, пропущено по решению 1');

-- Защита ранее применённых строк: даже если у применённой строки (CREATED) искусственно появилось замечание, разбор её не трогает
create temp table _r2 as select status, messages, data, review_code, apply_action, applied_id, processed_at from pg_temp.row_(2);
update import_job_rows set status='NEEDS_REVIEW', review_code='UNIT_UNKNOWN', messages=array['Отдел «Охрана труда» не найден'] where job_id=pg_temp.job() and row_no=2;
create temp table _prot(j jsonb);
insert into _prot select pg_temp.rj('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 100, 0)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select status='NEEDS_REVIEW' and messages=array['Отдел «Охрана труда» не найден'] and data=(select data from _r2) and apply_action='CREATED' and applied_id=(select applied_id from _r2) from pg_temp.row_(2)), 'F1 применённая строка (apply_action=CREATED) не разбирается и не меняется');
select pg_temp.ok((select (j->>'processed')::int=3 from _prot), 'F1a разбор взял только 3 неприменённые нерешённые строки');
select pg_temp.ok((select (pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid)::text$q$, pg_temp.kid('job')))->>'rows_with_unit_issue')::int=3), 'F1b скан не включает применённую строку');
update import_job_rows set status=(select status from _r2), review_code=(select review_code from _r2), messages=(select messages from _r2) where job_id=pg_temp.job() and row_no=2;

-- ====================== Состояния и безопасность ======================
insert into k select 'job_staged', pg_temp.stage_job('staged.xlsx', jsonb_build_array(pg_temp.rw(2,'Z-1','Стейджд Тест','Неизвестный департамент')), 'cccccccc-0000-4000-8000-000000000002'::uuid);
select pg_temp.ok((select (pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid)::text$q$, pg_temp.kid('job_staged')))->>'groups')::int=1), 'C1 скан работает и для неприменённого (STAGED) задания');
update import_jobs set status='CANCELLED' where id=pg_temp.kid('job_staged')::uuid;
select pg_temp.err_as('C', format($q$select import_orgmap_scan(%L::uuid)$q$, pg_temp.kid('job_staged')), 'C2 отменённое задание не сканируется', 'Импорт уже завершён');
select pg_temp.err_as('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 10, 0)$q$, pg_temp.kid('job_staged')), 'C3 отменённое задание не разбирается', 'Импорт уже завершён');
select pg_temp.err_as('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 1000, 0)$q$, pg_temp.kid('job')), 'C4 размер пакета ограничен', 'Размер пакета');
select pg_temp.err_as('F', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 10, 0)$q$, pg_temp.kid('job')), 'C5 FINANCE не запускает разбор', 'Импорт не найден');
select pg_temp.ok((select bool_and(not prosecdef) from pg_proc where proname like 'import_orgmap_%' or proname='trg_import_org_mappings_check'), 'C6 все новые функции — SECURITY INVOKER (DEFINER не добавлялся)');
select pg_temp.ok((select bool_and(proconfig @> array['search_path=public, pg_temp']) from pg_proc where proname like 'import_orgmap_%' or proname='trg_import_org_mappings_check'), 'C7 у всех новых функций задан search_path');
select pg_temp.ok((select not has_function_privilege('anon','import_orgmap_apply(uuid,jsonb,boolean,text)','execute') and not has_function_privilege('anon','import_orgmap_scan(uuid,integer,integer)','execute')
                          and has_function_privilege('authenticated','import_orgmap_apply(uuid,jsonb,boolean,text)','execute') from pg_proc limit 1), 'C8 права execute: authenticated — да, anon — нет');
select pg_temp.ok((select not has_table_privilege('anon','import_org_mappings','select') and (select relrowsecurity from pg_class where relname='import_org_mappings')), 'C9 у таблицы сопоставлений включён RLS, anon доступа нет');
select pg_temp.ok((select count(*)=0 from pg_proc where proname in ('import_reanalyze_row','import_apply_resolved_batch','import_reanalyze_job','import_resolved_preview') and prosecdef), 'C10 M24–M26 функции остались INVOKER (не переопределены)');

-- ====================== Итог ======================
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
