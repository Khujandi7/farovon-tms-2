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

-- 3) повторный разбор уже разрешённой строки — безопасный no-op (идемпотентность), данные и счётчики не меняются
create temp table _snap as select data, status, messages from import_job_rows where id=pg_temp.kid('row2')::bigint;
delete from _re;
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row2')))::jsonb;
select pg_temp.ok((select (j->>'noop')::boolean and (j->>'resolved')::boolean from _re), 'R7 повторный разбор разрешённой строки — no-op (идемпотентно)');
select pg_temp.ok((select r.data = s.data and r.status = s.status and r.messages = s.messages from import_job_rows r, _snap s where r.id=pg_temp.kid('row2')::bigint), 'R7a no-op не меняет строку');
-- 4) реанализ без права
-- VIEWER не видит строки импорта (RLS can_import) → строка для него не найдена, как и в import_resolve_row
select pg_temp.err_as('D', format($q$select import_reanalyze_row(%s)$q$, pg_temp.kid('row3')), 'R8 VIEWER не разбирает строки импорта (строка скрыта RLS)', 'Строка не найдена');
-- 5) счётчики задания отражают реальность: обе строки стали NEW, на проверке 0
select pg_temp.ok((select review_rows=0 and new_rows=2 from import_jobs where id=pg_temp.kid('job')::uuid), 'R9 счётчики задания пересчитаны (на проверке 0, новых 2)');


-- ====================== Дополнительные проверки безопасности и идемпотентности ======================
-- Решение пользователя «Пропустить» не затирается повторной проверкой
insert into k select 'job2', pg_temp.rv('A', $q$select import_stage('EMPLOYEES','XLSX','dop.xlsx', null, '{}'::jsonb, '{}'::jsonb,
  jsonb_build_array(jsonb_build_object('row_no',2,'raw','{"ФИО":"Мельников Макар"}'::jsonb,'data','{"full_name":"Мельников Макар","department":"Ремонтная служба"}'::jsonb)))$q$);
insert into k select 'row4', (select id::text from import_job_rows where job_id=pg_temp.kid('job2')::uuid and row_no=2);
select pg_temp.rv('A', format($q$select import_resolve_row(%s, 'SKIP')$q$, pg_temp.kid('row4')));
insert into k select 'dep4', pg_temp.rv('A', $q$select create_org_unit('{"name":"Ремонтная служба"}'::jsonb, 'тест')$q$);
delete from _re;
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row4')))::jsonb;
select pg_temp.ok((select decision='SKIP' and status='NEEDS_REVIEW' and (data->>'department_id')::bigint = pg_temp.kid('dep4')::bigint from import_job_rows where id=pg_temp.kid('row4')::bigint), 'R10 решение «Пропустить» сохранено, подразделение проставлено');
select pg_temp.ok((select (j->>'resolved')::boolean from _re), 'R10a подразделение разрешено');
select pg_temp.ok((select count(*)=0 from dq_issues where fingerprint='IMPORT|'||pg_temp.kid('job2')||'|'||pg_temp.kid('row4') and status in ('OPEN','IN_REVIEW')), 'R10b замечание закрыто');
-- нельзя разбирать строку в применённом/отменённом задании
update import_jobs set status='CANCELLED' where id=pg_temp.kid('job2')::uuid;
select pg_temp.err_as('A', format($q$select import_reanalyze_row(%s)$q$, pg_temp.kid('row4')), 'R11 в отменённом задании разбор отклоняется', 'завершён');
-- неразрешившееся название остаётся на проверке, замечание обновляется
insert into k select 'job3', pg_temp.rv('A', $q$select import_stage('EMPLOYEES','XLSX','dop3.xlsx', null, '{}'::jsonb, '{}'::jsonb,
  jsonb_build_array(jsonb_build_object('row_no',2,'raw','{"ФИО":"Зайцев Захар"}'::jsonb,'data','{"full_name":"Зайцев Захар","department":"Совсем неизвестное"}'::jsonb)))$q$);
insert into k select 'row5', (select id::text from import_job_rows where job_id=pg_temp.kid('job3')::uuid and row_no=2);
delete from _re;
insert into _re select pg_temp.rv('A', format($q$select import_reanalyze_row(%s)::text$q$, pg_temp.kid('row5')))::jsonb;
select pg_temp.ok((select not (j->>'resolved')::boolean from _re) and (select status='NEEDS_REVIEW' and review_code='UNIT_UNKNOWN' from import_job_rows where id=pg_temp.kid('row5')::bigint), 'R12 пока подразделения нет — строка остаётся на проверке');
select pg_temp.ok((select count(*)=1 from dq_issues where fingerprint='IMPORT|'||pg_temp.kid('job3')||'|'||pg_temp.kid('row5') and status='OPEN'), 'R12a замечание остаётся открытым');

-- Алиасы: конфликты и идемпотентность
select pg_temp.rv('A', format($q$select add_org_unit_alias(%s, 'Бройлерное направление', 'повтор')$q$, pg_temp.kid('dep2')));
select pg_temp.ok((select count(*)=1 from org_unit_aliases where org_unit_id=pg_temp.kid('dep2')::bigint and alias_norm=norm_name('Бройлерное направление')), 'A5 повтор того же написания не создаёт второй псевдоним');
select pg_temp.err_as('A', format($q$select add_org_unit_alias(%s, 'Ремонтная служба', 'конфликт с названием')$q$, pg_temp.kid('dep3')), 'A6 написание нельзя совместить с названием другого подразделения', 'совпадает с названием');
update org_units set is_active=false where id=pg_temp.kid('dep4')::bigint;
select pg_temp.err_as('A', format($q$select add_org_unit_alias(%s, 'Любая служба', 'неактивное')$q$, pg_temp.kid('dep4')), 'A7 неактивному подразделению написание не закрепляется', 'неактивно');
update org_units set is_active=true where id=pg_temp.kid('dep4')::bigint;
select pg_temp.ok((select count(*) >= 1 from audit_log where table_name='org_unit_aliases' and action='INSERT' and reason='подтверждённое написание'), 'A8 закрепление написания попало в аудит с причиной');

-- Массовое добавление: идемпотентность, неоднозначный родитель, неактивный дубль, совпадение с написанием
create temp table _b2(j jsonb);
insert into _b2 select pg_temp.rv('A', $q$select create_org_units_bulk('[
  {"name":"Служба качества"},
  {"name":"Лаборатория","parent":"Служба качества"},
  {"name":"Бройлерное направление"},
  {"name":"Совсем новое управление"}
]'::jsonb, 'повтор списка')::text$q$)::jsonb;
select pg_temp.ok((select (j->>'created')::int=1 and (j->>'skipped')::int=3 from _b2), 'M5 повтор списка: создано только новое, остальное — дубли (идемпотентно)');
select pg_temp.ok((select exists(select 1 from jsonb_array_elements(j->'skipped_items') x where x->>'reason' like '%написанием%') from _b2), 'M5a совпадение с подтверждённым написанием помечено как дубль с причиной');
select pg_temp.ok((select count(*)=0 from org_units where norm_name(name)=norm_name('Бройлерное направление')), 'M5b второе подразделение с таким написанием не создано');
-- неактивный дубль — ошибка (нужно восстановить)
update org_units set is_active=false where id=pg_temp.kid('dep4')::bigint;
delete from _b2;
insert into _b2 select pg_temp.rv('A', $q$select create_org_units_bulk('[{"name":"Ремонтная служба"}]'::jsonb, 'неактивный')::text$q$)::jsonb;
select pg_temp.ok((select (j->>'created')::int=0 and jsonb_array_length(j->'errors')=1 from _b2), 'M6 совпадение с неактивным подразделением — ошибка, не дубль в справочнике');
update org_units set is_active=true where id=pg_temp.kid('dep4')::bigint;
-- неоднозначный родитель: название департамента совпадает с написанием другого не бывает (запрещено A6), поэтому имитируем прямой вставкой
insert into org_units(name, level) values ('Склад', 'DEPARTMENT');
insert into org_unit_aliases(org_unit_id, alias_norm) select id, norm_name('Складское хозяйство') from org_units where name='Склад';
insert into org_units(name, level) values ('Складское хозяйство', 'DEPARTMENT');
delete from _b2;
insert into _b2 select pg_temp.rv('A', $q$select create_org_units_bulk('[{"name":"Отдел учёта","parent":"Складское хозяйство"}]'::jsonb, 'неоднозначно')::text$q$)::jsonb;
select pg_temp.ok((select (j->>'created')::int=0 and (j->'errors'->0->>'error') like '%неоднозначен%' from _b2), 'M7 неоднозначный департамент-родитель — ошибка, ничего не создано');
select pg_temp.ok((select count(*)=0 from org_units where name='Отдел учёта'), 'M7a отдел не создан «по догадке»');
select pg_temp.err_as('F', $q$select create_org_units_bulk('[{"name":"Финблок"}]'::jsonb, 'r')$q$, 'M8 FINANCE не делает массовое добавление', 'Недостаточно прав');
select pg_temp.err_as('A', $q$select create_org_units_bulk('[]'::jsonb, 'r')$q$, 'M9 пустой список отклоняется', 'пуст');
select pg_temp.ok((select count(*) >= 1 from audit_log where table_name='org_units' and action='INSERT' and reason='массовое добавление'), 'M10 массовое создание попало в аудит с причиной');
-- права на функции: anon не вызывает, search_path закреплён, SECURITY INVOKER
select pg_temp.ok(not has_function_privilege('anon', 'add_org_unit_alias(bigint, text, text)', 'execute')
               and not has_function_privilege('anon', 'import_reanalyze_row(bigint)', 'execute')
               and not has_function_privilege('anon', 'create_org_units_bulk(jsonb, text)', 'execute'), 'S1 anon не вызывает функции M24');
select pg_temp.ok((select bool_and(not p.prosecdef and p.proconfig @> array['search_path=public, pg_temp']) from pg_proc p
                   where p.pronamespace='public'::regnamespace and p.proname in ('add_org_unit_alias','import_reanalyze_row','create_org_units_bulk')), 'S2 функции M24: SECURITY INVOKER и фиксированный search_path');

-- ====================== Итог ======================
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
