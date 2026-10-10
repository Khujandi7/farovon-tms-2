-- Тесты HOTFIX M28: записи-пути справочника («Родитель → Потомок») не должны мешать сопоставлению оргструктуры в импорте.
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

create or replace function pg_temp.rw(n int, code text, name text, dept text, unit text, p text) returns jsonb language sql as $$
  select jsonb_build_object('row_no', n, 'raw', jsonb_build_object('ФИО', name, 'Департамент', dept, 'Отдел', unit, 'Полный путь подразделения', p),
    'data', jsonb_strip_nulls(jsonb_build_object('employee_code', code, 'full_name', name, 'position', 'Оператор', 'department', dept, 'unit', unit))) $$;

-- ====================== Справочник как в Production: настоящие департаменты + записи-пути, настоящих отделов из файла нет ======================
select pg_temp.rv('A', $q$select create_org_unit('{"name":"Финансы"}'::jsonb, 'тест')$q$);
select pg_temp.rv('A', $q$select create_org_unit('{"name":"Закупки"}'::jsonb, 'тест')$q$);
select pg_temp.rv('A', $q$select create_org_units_bulk('[{"name":"Отдел отчетности","parent":"Финансы"},{"name":"Отдел логистики","parent":"Закупки"}]'::jsonb, 'тест')::text$q$);
-- записи-пути (так в Production записаны рёбра иерархии)
select pg_temp.rv('A', $q$select create_org_unit('{"name":"Правление → Продажи Х (Опт)"}'::jsonb, 'тест')$q$);
select pg_temp.rv('A', $q$select create_org_unit('{"name":"Продажи Х (Опт) → 011 Отдел Север"}'::jsonb, 'тест')$q$);
select pg_temp.rv('A', $q$select create_org_unit('{"name":"011 Отдел Север → 0111 СТТ Север"}'::jsonb, 'тест')$q$);
select pg_temp.rv('A', $q$select create_org_unit('{"name":"Казначейство → Отдел банковских операций"}'::jsonb, 'тест')$q$);
delete from audit_log;
create temp table _org0 as select id, name, level, parent_id, is_active from org_units;

insert into k select 'job', pg_temp.stage_job('employees.xlsx', jsonb_build_array(
  pg_temp.rw(2,'S-1','Север Один','Продажи Х (Опт)','0111 СТТ Север','Правление / Продажи Х (Опт) / 011 Отдел Север / 0111 СТТ Север'),
  pg_temp.rw(3,'S-2','Север Два','Продажи Х (Опт)','0111 СТТ Север','Правление / Продажи Х (Опт) / 011 Отдел Север / 0111 СТТ Север'),
  pg_temp.rw(4,'S-3','Север Три','Продажи Х (Опт)','011 Отдел Север','Правление / Продажи Х (Опт) / 011 Отдел Север'),
  pg_temp.rw(5,'F-1','Фин Один','Финансы','Отдел банковских операций','Правление / Финансы / Казначейство / Отдел банковских операций'),
  pg_temp.rw(6,'F-2','Фин Два','Финансы','Отдел кассовых операций','Правление / Финансы / Казначейство / Отдел кассовых операций'),
  pg_temp.rw(7,'F-3','Фин Три','Финансы','Отдел отчётности и анализа','Правление / Финансы / Отдел отчётности и анализа'),
  pg_temp.rw(8,'F-4','Фин Четыре','Финансы','Отдел логистики Север','Правление / Финансы / Отдел логистики Север'),
  pg_temp.rw(9,'S-9','Север Решён','Продажи Х (Опт)','011 Отдел Север','Правление / Продажи Х (Опт) / 011 Отдел Север')
), 'cccccccc-0000-4000-8000-000000000005'::uuid);
select pg_temp.ok((select count(*)=8 and bool_and(status='NEEDS_REVIEW') from import_job_rows where job_id=pg_temp.job()), 'E0 все 8 строк ждут решения (отделов из файла в справочнике нет)');
select pg_temp.rv('C', format($q$select import_resolve_row(%s, 'SKIP')$q$, (select id from import_job_rows where job_id=pg_temp.job() and row_no=9)));
create temp table _pr as select id as pr_id from org_units where name='Продажи Х (Опт) → 011 Отдел Север';
create temp table _pr0 as select id as pr_id from org_units where name='Правление → Продажи Х (Опт)';

-- ====================== Ошибочное сопоставление департамента с записью-путём больше невозможно ======================
select pg_temp.ok((select (pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.kid('job'),
        jsonb_build_array(jsonb_build_object('kind','DEPARTMENT','src_name','Продажи Х (Опт)','scope','','action','MAP','org_unit_id',(select pr_id from _pr)))))->'items'->0->>'ok')::boolean = false
        and (pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.kid('job'),
        jsonb_build_array(jsonb_build_object('kind','DEPARTMENT','src_name','Продажи Х (Опт)','scope','','action','MAP','org_unit_id',(select pr_id from _pr)))))->'items'->0->>'error') like '%это путь%'),
        'P1 департамент из файла нельзя сопоставить с записью-путём «A → B» (понятная ошибка)');
select pg_temp.ok((select (pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.kid('job'),
        jsonb_build_array(jsonb_build_object('kind','DEPARTMENT','src_name','Продажи Х (Опт)','scope','','action','ALIAS','org_unit_id',(select pr_id from _pr)))))->'items'->0->>'ok')::boolean = false), 'P2 и закрепить написание за записью-путём нельзя');
select pg_temp.err_as('C', format($q$insert into import_org_mappings(job_id,kind,src_name,src_norm,scope,org_unit_id,reason) values (%L,'DEPARTMENT','Продажи Х (Опт)',norm_name('Продажи Х (Опт)'),'',%s,'x')$q$, pg_temp.kid('job'), (select pr_id from _pr)),
        'P3 триггер таблицы тоже не пускает запись-путь', 'это путь');

-- ====================== Состояние как в Production: сопоставление уже сохранено (старым кодом), строки ушли в «департамент найден» ======================
alter table import_org_mappings disable trigger import_org_mappings_check;
insert into import_org_mappings(job_id,kind,src_name,src_norm,scope,org_unit_id,reason)
  values (pg_temp.job(),'DEPARTMENT','Продажи Х (Опт)',norm_name('Продажи Х (Опт)'),'',(select pr_id from _pr),'исторически сохранено');
alter table import_org_mappings enable trigger import_org_mappings_check;
update import_job_rows set data = data || jsonb_build_object('department_id', (select pr_id from _pr)),
       messages = array(select m from unnest(messages) m where m not like 'Подразделение «%')
 where job_id=pg_temp.job() and row_no in (2,3,4,9);
create temp table _decided as select id, data, messages, status, decision from import_job_rows where job_id=pg_temp.job() and row_no=9;
select pg_temp.ok((select decision is not null from _decided), 'E1 строка 9 имеет решение пользователя (должна остаться нетронутой)');

create temp table _scan(n serial, j jsonb);
insert into _scan(j) select pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 300, 0)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'saved_mappings')::int=1 and j->'mappings'->0->>'invalid' like 'Запись-путь%' and (j->'mappings'->0->>'open_rows')::int=3 from _scan where n=1),
                  'S1 скан показывает сохранённое сопоставление и называет его недопустимым (запись-путь); с ним связано 3 нерешённые строки');
select pg_temp.ok((select pg_temp.grp(j,'UNIT','0111 СТТ Север','P:'||(select pr_id from _pr))->>'cause'='PARENT_UNRESOLVED'
                          and pg_temp.grp(j,'UNIT','0111 СТТ Север','P:'||(select pr_id from _pr))->>'scope_label' like '%запись-путь%'
                          and pg_temp.grp(j,'UNIT','0111 СТТ Север','P:'||(select pr_id from _pr))->>'src_path'='Правление / Продажи Х (Опт) / 011 Отдел Север / 0111 СТТ Север' from _scan where n=1),
                  'S2 отдел под «департаментом-путём»: причина «сначала департамент», в контексте видно «запись-путь», полный путь из файла показан');
select pg_temp.ok((select pg_temp.grp(j,'UNIT','0111 СТТ Север','P:'||(select pr_id from _pr))->>'action'='DEPT_FIRST' from _scan where n=1), 'S3 рекомендация — не создавать отдел под записью-путём');
select pg_temp.ok((select (pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.kid('job'),
        jsonb_build_array(jsonb_build_object('kind','UNIT','src_name','0111 СТТ Север','scope','P:'||(select pr_id from _pr),'action','CREATE'))))->'items'->0->>'ok')::boolean=false),
        'S4 создать отдел под записью-путём нельзя (предпросмотр отклоняет)');

-- ====================== «Снять сопоставление» департамента возвращает строки в «департамент не найден» ======================
create temp table _dry(j jsonb);
insert into _dry select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.kid('job'),
        jsonb_build_array(jsonb_build_object('kind','DEPARTMENT','src_name','Продажи Х (Опт)','scope','','action','CLEAR'))));
select pg_temp.ok((select (j->'items'->0->>'ok')::boolean and (j->'items'->0->>'rows')::int=3 from _dry), 'C1 предпросмотр «снять»: допустимо, затронет 3 строки');
select pg_temp.ok((select count(*)=1 from import_org_mappings where job_id=pg_temp.job()) and (select (data->>'department_id') is not null from pg_temp.row_(2)), 'C2 предпросмотр ничего не изменил');
create temp table _cl(j jsonb);
insert into _cl select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'Снять ошибочное')::text$q$, pg_temp.kid('job'),
        jsonb_build_array(jsonb_build_object('kind','DEPARTMENT','src_name','Продажи Х (Опт)','scope','','action','CLEAR'))));
select pg_temp.ok((select (j->>'cleared')::int=1 and (j->'items'->0->>'rows')::int=3 from _cl), 'C3 снятие выполнено, возвращено 3 строки');
select pg_temp.ok((select count(*)=0 from import_org_mappings where job_id=pg_temp.job())
        and (select not (data ? 'department_id') and exists (select 1 from unnest(messages) m where m='Подразделение «Продажи Х (Опт)» не найдено') from pg_temp.row_(2))
        and (select not (data ? 'department_id') and exists (select 1 from unnest(messages) m where m='Подразделение «Продажи Х (Опт)» не найдено') from pg_temp.row_(4)),
        'C4 строки снова с замечанием «Подразделение «…» не найдено», department_id убран; сопоставления нет');
select pg_temp.ok((select (d.data, d.messages, d.status, d.decision) is not distinct from (r.data, r.messages, r.status, r.decision) from _decided d join import_job_rows r on r.id = d.id), 'C5 строка с решением пользователя не тронута');
insert into _scan(j) select pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 300, 0)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select pg_temp.grp(j,'DEPARTMENT','Продажи Х (Опт)','')->>'cause'='MISSING' and pg_temp.grp(j,'DEPARTMENT','Продажи Х (Опт)','')->>'action'='CREATE'
                          and exists (select 1 from jsonb_array_elements(pg_temp.grp(j,'DEPARTMENT','Продажи Х (Опт)','')->'candidates') c where c->>'kind'='PATH_RECORD' and (c->>'allowed')::boolean=false) from _scan where n=2),
                  'C6 департамент из файла снова виден как «нигде нет»; запись-путь показана кандидатом PATH_RECORD и недоступна к выбору');
select pg_temp.ok((select pg_temp.grp(j,'UNIT','0111 СТТ Север','D:'||norm_name('Продажи Х (Опт)'))->>'cause'='PARENT_UNRESOLVED' from _scan where n=2), 'C7 отдел снова привязан к департаменту ИЗ ФАЙЛА (а не к чужой записи)');

-- ====================== Остальные значения: подсказки и рекомендации ======================
select pg_temp.ok((select pg_temp.grp(j,'UNIT','Отдел банковских операций','P:'||pg_temp.dept('Финансы'))->>'cause'='MISSING'
                          and pg_temp.grp(j,'UNIT','Отдел банковских операций','P:'||pg_temp.dept('Финансы'))->>'action'='CREATE'
                          and exists (select 1 from jsonb_array_elements(pg_temp.grp(j,'UNIT','Отдел банковских операций','P:'||pg_temp.dept('Финансы'))->'candidates') c where c->>'kind'='PATH_RECORD' and c->>'name'='Казначейство → Отдел банковских операций')
                          and pg_temp.grp(j,'UNIT','Отдел банковских операций','P:'||pg_temp.dept('Финансы'))->>'src_path'='Правление / Финансы / Казначейство / Отдел банковских операций' from _scan where n=2),
                  'D1 отдел есть в справочнике только как запись-путь: причина MISSING, рекомендация «создать в департаменте из файла», запись-путь показана как доказательство');
select pg_temp.ok((select pg_temp.grp(j,'UNIT','Отдел отчётности и анализа','P:'||pg_temp.dept('Финансы'))->>'cause'='SIMILAR'
                          and pg_temp.grp(j,'UNIT','Отдел отчётности и анализа','P:'||pg_temp.dept('Финансы'))->>'action'='DECIDE' from _scan where n=2),
                  'D2 похожий отдел В ТОМ ЖЕ департаменте («Отдел отчетности»): без автосоздания — нужно решение человека');
select pg_temp.ok((select pg_temp.grp(j,'UNIT','Отдел логистики Север','P:'||pg_temp.dept('Финансы'))->>'cause'='SIMILAR'
                          and pg_temp.grp(j,'UNIT','Отдел логистики Север','P:'||pg_temp.dept('Финансы'))->>'action'='CREATE' from _scan where n=2),
                  'D3 похожий отдел («Отдел логистики») только в ДРУГОМ департаменте («Закупки»): к чужому не привязывается, рекомендация «создать» (человек подтверждает в предпросмотре)');
select pg_temp.ok((select pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 300, 0)::text$q$, pg_temp.kid('job')))->>'saved_mappings'='0'), 'D4 сохранённых сопоставлений нет — счётчик 0');

-- ====================== Завершение: департамент + отделы создаются одним сохранением, затем разбор ======================
create temp table _fix(j jsonb);
insert into _fix select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'Создать из файла')::text$q$, pg_temp.kid('job'), jsonb_build_array(
   jsonb_build_object('kind','UNIT','src_name','0111 СТТ Север','scope','D:'||norm_name('Продажи Х (Опт)'),'action','CREATE'),
   jsonb_build_object('kind','UNIT','src_name','011 Отдел Север','scope','D:'||norm_name('Продажи Х (Опт)'),'action','CREATE'),
   jsonb_build_object('kind','DEPARTMENT','src_name','Продажи Х (Опт)','scope','','action','CREATE'),
   jsonb_build_object('kind','UNIT','src_name','Отдел банковских операций','scope','P:'||pg_temp.dept('Финансы'),'action','CREATE'),
   jsonb_build_object('kind','UNIT','src_name','Отдел кассовых операций','scope','P:'||pg_temp.dept('Финансы'),'action','CREATE'))));
select pg_temp.ok((select (j->>'ok')::int=5 and (j->>'failed')::int=0 and (j->>'created')::int=5 from _fix), 'F1 департамент и 4 отдела созданы за одно сохранение (департаменты обрабатываются первыми)');
select pg_temp.ok((select count(*)=2 from org_units where level='UNIT' and parent_id=pg_temp.dept('Продажи Х (Опт)')), 'F2 отделы созданы под НАСТОЯЩИМ департаментом из файла, а не под записью-путём');
select pg_temp.ok((select count(*)=0 from org_units where parent_id in (select pr_id from _pr union select pr_id from _pr0)), 'F3 под записями-путями дочерних подразделений нет');
create temp table _ra(j jsonb);
insert into _ra select pg_temp.rj('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 200, 0)::text$q$, pg_temp.kid('job')));
select pg_temp.ok((select (j->>'resolved')::int=5 and (j->>'errors')::int=0 from _ra), 'F4 повторный разбор решил 5 строк (2, 3, 4, 5, 6); остались 7 и 8 (нужно решение по «Отчётности»); строка 9 с решением не тронута');
select pg_temp.ok((select count(*)=5 and bool_and(status='NEW') and bool_and((data->>'unit_id') is not null) from import_job_rows where job_id=pg_temp.job() and row_no in (2,3,4,5,6)), 'F5 решённые строки получили отдел и департамент, статус NEW');
select pg_temp.ok((select (d.data, d.messages, d.status, d.decision) is not distinct from (r.data, r.messages, r.status, r.decision) from _decided d join import_job_rows r on r.id = d.id), 'F6 строка с решением по-прежнему не тронута');

-- ====================== Ничего лишнего ======================
select pg_temp.ok((select count(*)=0 from _org0 o join org_units u using (id) where (o.name,o.level,o.parent_id,o.is_active) is distinct from (u.name,u.level,u.parent_id,u.is_active)), 'G1 существующие записи справочника (в т.ч. записи-пути) не изменены');
select pg_temp.ok((select count(*)=(select count(*) from _org0)+5 from org_units), 'G2 в справочнике добавлено ровно 5 подразделений (1 департамент и 4 отдела)');
select pg_temp.ok((select count(*)=0 from employees), 'G3 сотрудников функции сопоставления не создают');
select pg_temp.err_as('D', format($q$select import_orgmap_apply(%L::uuid, '[{"kind":"DEPARTMENT","src_name":"x","scope":"","action":"CLEAR"}]'::jsonb, true)$q$, pg_temp.kid('job')), 'G4 VIEWER не может снимать сопоставления', 'Импорт не найден');
select pg_temp.ok((select bool_and(not prosecdef) and bool_and(proconfig @> array['search_path=public, pg_temp']) from pg_proc where proname in ('org_is_path_record','import_orgmap_scan','import_orgmap_apply','import_orgmap_resolve','import_orgmap_check_target','import_orgmap_scope_dept')), 'G5 функции SECURITY INVOKER, search_path задан');
select pg_temp.ok((select not has_function_privilege('anon','org_is_path_record(text)','execute') and has_function_privilege('authenticated','org_is_path_record(text)','execute') from pg_proc limit 1), 'G6 права execute у org_is_path_record: authenticated — да, anon — нет');

do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
