-- Тесты HOTFIX M29: ограничение времени при сопоставлении оргструктуры (производительность без потери результата).
-- Набор повторяет Production: 2646 строк, 1770 применено, 855 строк с неразрешёнными отделами в 114 значениях (33 значения — в контексте записи-пути),
-- 21 строка EMPLOYEE_FUZZY, 3 исторических сопоставления к записям-путям, 241 запись-путь в справочнике. Только локально. Заканчивается ошибкой RESULT (откат).

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

-- ====================== Набор как в Production ======================
insert into org_units(name, level) select 'Департамент '||g, 'DEPARTMENT' from generate_series(1,14) g;
insert into org_units(name, level, parent_id) select 'Отдел существующий '||g, 'UNIT', (select id from org_units where name='Департамент '||(1+g%14)) from generate_series(1,97) g;
insert into org_units(name, level) select 'Департамент '||(1+g%14)||' → Подотдел '||g, 'DEPARTMENT' from generate_series(1,241) g;
insert into k values ('job', gen_random_uuid()::text);
insert into import_jobs(id, entity, source, file_name, status, total_rows, review_rows, inserted, skipped, conflicts, created_by)
  values (pg_temp.job(),'EMPLOYEES','XLSX','prod-like.xlsx','COMMITTED',2646,876,1770,876,876,'00000000-0000-0000-0000-00000000000a');
insert into import_job_rows(job_id,row_no,raw,data,status,apply_action,applied_id,processed_at,messages)
select pg_temp.job(), g, jsonb_build_object('ФИО','Сотр '||g,'Отдел','Отдел существующий '||(1+g%97),'Департамент','Департамент '||(1+g%14)),
  jsonb_build_object('full_name','Сотр '||g,'department_id',(select id from org_units where name='Департамент '||(1+g%14)),'unit_id',1), 'NEW','CREATED',gen_random_uuid(),now(),array['Подразделение найдено в справочнике']
from generate_series(1,1770) g;
create temp table _grp as
select i, 'Отдел новый '||i||' (Опт)' as nm,
       case when i<=33 then (select id from org_units where name like '% → Подотдел 1') else (select id from org_units where name='Департамент '||(1+i%14)) end as did,
       case when i<=33 then 14 + (i<=24)::int else 4 + (i<=78)::int end n from generate_series(1,114) i;
insert into import_job_rows(job_id,row_no,raw,data,status,apply_action,processed_at,messages,review_code)
select pg_temp.job(), 2000+row_number() over (), jsonb_build_object('ФИО','Сотр н'||g.i||'_'||k,'Отдел',g.nm,'Департамент','Департамент '||(1+g.i%14),'Полный путь подразделения','Правление / Департамент '||(1+g.i%14)||' / Подотдел / '||g.nm),
  jsonb_build_object('full_name','Сотр н'||g.i,'department_id',g.did),'NEEDS_REVIEW','SKIPPED',now(), array['Отдел «'||g.nm||'» не найден'],'UNIT_UNKNOWN'
from _grp g cross join lateral generate_series(1,g.n) k;
insert into import_job_rows(job_id,row_no,raw,data,status,apply_action,processed_at,messages,review_code)
select pg_temp.job(), 5000+g, '{"ФИО":"Нечёткий"}', '{}', 'NEEDS_REVIEW','SKIPPED',now(), array['Требуется решение по сотруднику'],'EMPLOYEE_FUZZY' from generate_series(1,21) g;
alter table import_org_mappings disable trigger import_org_mappings_check;
insert into import_org_mappings(job_id,kind,src_name,src_norm,scope,org_unit_id,reason)
 select pg_temp.job(),'DEPARTMENT','Деп-из-файла '||g,norm_name('Деп-из-файла '||g),'',(select id from org_units where name like '% → Подотдел '||g),'x' from generate_series(1,3) g;
alter table import_org_mappings enable trigger import_org_mappings_check;
analyze import_job_rows; analyze org_units;
delete from audit_log;
create temp table _applied0 as select id, md5(data::text || coalesce(applied_id::text,'') || messages::text) h from import_job_rows where apply_action='CREATED';
create temp table _org0 as select count(*) n, md5(string_agg(id||name||coalesce(parent_id::text,''), ',' order by id)) h from org_units;

-- ====================== P. Эквивалентность быстрых функций прежним ======================
select pg_temp.ok((select count(*)=0 from (select norm_name(a.name) x, norm_name(b.name) y from org_units a, org_units b where a.id<b.id and a.id<=60) q
   where import_orgmap_similar(x,y) is distinct from import_orgmap_similar_fast(x,y,import_orgmap_pfx(x),import_orgmap_pfx(y))), 'P1 «похоже» по токенам == прежнее условие на всех парах справочника');
select pg_temp.ok((select count(*)=0 from (select norm_name(t) x, norm_name(u) y from unnest(array['Отдел продажа комбикормов','Отдел продаж комбикормов','Лаборатория А1','Лаборатория Т1','СО Анхор','СО Анхор 3','Управление отдел','Отдел кадров','Отдел кадр','Центр сервиса','Центр сервис','Бройлерная птицефабрика Б3','Бройлерная птицефабрика Б1','абв','абвг']) t,
   unnest(array['Отдел продажа комбикормов','Отдел продаж комбикормов','Лаборатория А1','Лаборатория Т1','СО Анхор','СО Анхор 3','Управление отдел','Отдел кадров','Отдел кадр','Центр сервиса','Центр сервис','Бройлерная птицефабрика Б3','Бройлерная птицефабрика Б1','абв','абвг','Департамент снабжения']) u) q
   where import_orgmap_similar(x,y) is distinct from import_orgmap_similar_fast(x,y,import_orgmap_pfx(x),import_orgmap_pfx(y))), 'P2 то же на граничных названиях (служебные слова, короткие, один префикс)');
select pg_temp.ok((select count(*)=0 from (select key, n from jsonb_each_text(import_orgmap_row_counts(pg_temp.job())) e(key, n)) c
   where (select count(distinct jr.id) from import_job_rows jr cross join lateral import_orgmap_parse(jr.messages, jr.data) p
           where jr.job_id=pg_temp.job() and jr.status='NEEDS_REVIEW' and jr.decision is null and jr.applied_id is null and jr.apply_action is distinct from 'CREATED' and jr.apply_action is distinct from 'UPDATED'
             and p.kind || chr(31) || p.scope || chr(31) || norm_name(p.name) = c.key)::text is distinct from c.n), 'P3 счётчики строк пакетом == прежний подсчёт по каждому значению');
select pg_temp.ok((select (select count(*) from jsonb_object_keys(import_orgmap_row_counts(pg_temp.job()))) = 114), 'P4 114 значений, как в Production');
select pg_temp.ok((select sum(n::int)=855 from jsonb_each_text(import_orgmap_row_counts(pg_temp.job())) e(key, n)), 'P5 в сумме 855 строк с неразрешёнными отделами');

-- ====================== S. Скан на наборе Production ======================
create temp table _scan as select pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 500, 0)::text$q$, pg_temp.job())) s;
select pg_temp.ok((select (s->>'groups')::int=114 and (s->>'rows_with_unit_issue')::int=855 and (s->>'saved_mappings')::int=3 from _scan), 'S1 скан: 114 значений, 855 строк, 3 сохранённых сопоставления');
select pg_temp.ok((select (s#>>'{protected,applied}')::int=1770 from _scan), 'S2 применённые 1770 строк защищены и учтены');
select pg_temp.ok((select (select (e->>'rows')::int from jsonb_array_elements(s->'review_breakdown') e where e->>'code'='EMPLOYEE_FUZZY')=21
                       and (select (e->>'with_unit_issue')::int from jsonb_array_elements(s->'review_breakdown') e where e->>'code'='EMPLOYEE_FUZZY')=0 from _scan), 'S3 21 конфликт сотрудников не связан с оргструктурой');
select pg_temp.ok((select bool_and(m->>'invalid' is not null) and jsonb_array_length(s->'mappings')=3 from _scan, jsonb_array_elements(s->'mappings') m group by s), 'S4 все 3 исторических сопоставления к записям-путям помечены недопустимыми');
select pg_temp.ok((select (select count(*) from jsonb_array_elements(s->'groups_list') g where g->>'scope_label' like '%запись-путь%')=33 from _scan), 'S5 33 значения в контексте записи-пути помечены, 114 в списке');
select pg_temp.ok((select not exists (select 1 from jsonb_array_elements(s->'groups_list') g, jsonb_array_elements(g->'candidates') c where c->>'kind'='PATH_RECORD' and (c->>'allowed')::boolean) from _scan), 'S6 запись-путь никогда не «допустимый кандидат»');
select pg_temp.ok((select jsonb_array_length(s->'groups_list')=114 from _scan), 'S7 все группы возвращены одной страницей');
-- страницы по 50: объединение == один вызов
select pg_temp.ok((select (select count(*) from (
     select g->>'kind' k, g->>'scope' sc, g->>'src_norm' n from jsonb_array_elements(pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 50, 0)::text$q$, pg_temp.job()))->'groups_list') g
     union all select g->>'kind', g->>'scope', g->>'src_norm' from jsonb_array_elements(pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 50, 50)::text$q$, pg_temp.job()))->'groups_list') g
     union all select g->>'kind', g->>'scope', g->>'src_norm' from jsonb_array_elements(pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 50, 100)::text$q$, pg_temp.job()))->'groups_list') g) q)=114), 'S8 постраничный скан (50+50+14) даёт те же 114 значений');

-- ====================== T. Время и отмена ======================
create temp table _items as
 select jsonb_agg(jsonb_build_object('kind','UNIT','src_name',nm,'scope','P:'||did,'action','CREATE')) j from _grp where i>33 and i<=83;
-- департаменты-записи-пути как контекст нельзя; для создания берём настоящие департаменты
create temp table _items_ok as
 select jsonb_agg(jsonb_build_object('kind','UNIT','src_name',nm,'scope','P:'||did,'action','CREATE')) j from _grp where i>33;
create or replace function pg_temp.timed(p_sql text) returns numeric language plpgsql as $$
declare t0 timestamptz := clock_timestamp(); v text;
begin perform pg_temp.rv('C', p_sql); return extract(epoch from clock_timestamp()-t0); end $$;
select pg_temp.ok(pg_temp.timed(format($q$select import_orgmap_scan(%L::uuid, 500, 0)::text$q$, pg_temp.job())) < 4, 'T1 скан набора Production укладывается в 4 с (лимит роли 8 с)');
select pg_temp.ok(pg_temp.timed(format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.job(), (select j from _items_ok))) < 4, 'T2 предпросмотр 81 значения (все отделы с настоящим департаментом) < 4 с');
select pg_temp.ok((select (select count(*) from org_units)=(select n from _org0) and (select count(*) from import_org_mappings)=3), 'T3 предпросмотр ничего не записал');
select pg_temp.ok((select (pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.job(), (select j from _items_ok))))->>'ok' = '81'), 'T4 предпросмотр: все 81 значение «ok»');
-- таймаут: пакет отменяется целиком, ничего не сохранено
create or replace function pg_temp.t5() returns void language plpgsql as $$
declare ok boolean := false; v_items jsonb := (select j from _items_ok); v_job uuid := pg_temp.job();
begin
  perform set_config('request.jwt.claim.sub', pg_temp.uid('C'), true); set local role authenticated;
  begin perform import_orgmap_apply(v_job, v_items, false, 'тест таймаута');
  exception when query_canceled then ok := true; end;
  reset role;
  insert into res(name, ok) values ('T5 при таймауте приходит 57014 (query_canceled)', ok);
end $$;
set local statement_timeout = '40ms';
select pg_temp.t5();
reset statement_timeout;
select pg_temp.ok((select count(*)=(select n from _org0) from org_units) and (select count(*) from import_org_mappings)=3, 'T6 после таймаута: справочник и сопоставления без изменений (изменения шага отменены)');
select pg_temp.ok((select count(*)=0 from _applied0 a join import_job_rows r using (id) where md5(r.data::text || coalesce(r.applied_id::text,'') || r.messages::text) <> a.h), 'T7 1770 применённых строк не затронуты');

-- ====================== R. Сохранение, повтор, возобновление ======================
create temp table _r1 as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'тест')::text$q$, pg_temp.job(), (select j from _items_ok))) r;
select pg_temp.ok((select (r->>'ok')::int=81 and (r->>'created')::int=81 and (r->>'failed')::int=0 from _r1), 'R1 сохранение 81 отдела: создано 81, ошибок 0');
select pg_temp.ok((select count(*)=81 from org_units where name like 'Отдел новый % (Опт)' and level='UNIT' and parent_id is not null), 'R2 отделы созданы именно как отделы с родителем-департаментом');
select pg_temp.ok((select count(*)=0 from org_units u join org_units p on p.id=u.parent_id where u.level='UNIT' and org_is_path_record(p.name)), 'R3 ни одного отдела под записью-путём');
select pg_temp.ok((select (r->>'rows_affected')::int = (select sum(n::int) from jsonb_each_text(import_orgmap_row_counts(pg_temp.job())) e(key, n) where split_part(key, chr(31), 3) in (select norm_name(nm) from _grp where i>33)) from _r1), 'R4 «затронуто строк» совпадает с числом строк этих значений');
create temp table _r2 as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'повтор')::text$q$, pg_temp.job(), (select j from _items_ok))) r;
select pg_temp.ok((select (r->>'created')::int=0 and (r->>'failed')::int=81 from _r2) and (select count(*)=81 from org_units where name like 'Отдел новый % (Опт)'), 'R5 повторный запуск тех же значений: ничего не дублируется (81 отказ «уже есть»)');
-- перепроверка возвращает строки, ранее созданные отделы находятся
create temp table _ra as select pg_temp.rj('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 100, 0)::text$q$, pg_temp.job())) r;
select pg_temp.ok((select (r->>'processed')::int<=100 from _ra), 'R6 перепроверка пачкой ≤100 строк');
select pg_temp.ok((select count(*)=1770 from import_job_rows where job_id=pg_temp.job() and apply_action='CREATED') and (select count(*)=0 from _applied0 a join import_job_rows r using (id) where md5(r.data::text || coalesce(r.applied_id::text,'') || r.messages::text) <> a.h), 'R7 после сохранения и перепроверки применённые 1770 строк не изменились');

-- ====================== D. Снятие сопоставления департамента и счётчики ======================
create temp table _clr as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'снять')::text$q$, pg_temp.job(),
  '[{"kind":"DEPARTMENT","src_name":"Деп-из-файла 1","scope":"","action":"CLEAR"},{"kind":"DEPARTMENT","src_name":"Деп-из-файла 2","scope":"","action":"CLEAR"},{"kind":"DEPARTMENT","src_name":"Деп-из-файла 3","scope":"","action":"CLEAR"}]')) r;
select pg_temp.ok((select (r->>'cleared')::int=3 and (r->>'failed')::int=0 from _clr) and (select count(*)=0 from import_org_mappings where job_id=pg_temp.job()), 'D1 три исторических сопоставления сняты');

-- ====================== X. Безопасность ======================
select pg_temp.ok((select bool_and(not prosecdef) and bool_and(proconfig @> array['search_path=public, pg_temp']) from pg_proc where proname in ('import_orgmap_pfx','import_orgmap_similar_fast','import_orgmap_row_counts','import_orgmap_scan','import_orgmap_apply')), 'X1 функции SECURITY INVOKER, search_path задан');
select pg_temp.ok((select bool_and(not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute')) from pg_proc p where proname in ('import_orgmap_pfx','import_orgmap_similar_fast','import_orgmap_row_counts','import_orgmap_scan','import_orgmap_apply')), 'X2 execute: authenticated — да, anon и public — нет');
select pg_temp.ok((select not has_function_privilege('public', p.oid, 'execute') from pg_proc p where proname='import_orgmap_row_counts'), 'X3 public без execute у import_orgmap_row_counts');
select pg_temp.ok(pg_temp.rv('D', format($q$select import_orgmap_row_counts(%L::uuid)::text$q$, pg_temp.job())) = '{}', 'X4 VIEWER через RLS не видит строк задания: счётчики пусты');
select pg_temp.ok(pg_temp.rv('F', format($q$select import_orgmap_row_counts(%L::uuid)::text$q$, pg_temp.job())) = '{}', 'X5 FINANCE (нет прав на импорт) тоже получает пусто');
select pg_temp.err_as('D', format($q$select import_orgmap_scan(%L::uuid, 10, 0)$q$, pg_temp.job()), 'X6 VIEWER не может сканировать (задание ему не видно)', 'Импорт не найден');
select pg_temp.err_as('D', format($q$select import_orgmap_apply(%L::uuid, '[{"kind":"UNIT","src_name":"x","scope":"","action":"CREATE"}]'::jsonb, false, 'x')$q$, pg_temp.job()), 'X7 VIEWER не может сохранять (задание ему не видно)', 'Импорт не найден');
select pg_temp.err_as('C', $q$select import_orgmap_apply('00000000-0000-0000-0000-0000000000ff'::uuid, '[{"kind":"UNIT","src_name":"x","scope":"","action":"CREATE"}]'::jsonb, true)$q$, 'X8 подставленный чужой/несуществующий id задания отвергается', 'Импорт не найден');
select pg_temp.err_as('C', format($q$select import_orgmap_apply(%L::uuid, (select jsonb_agg(jsonb_build_object('kind','UNIT','src_name','z'||g,'scope','','action','CREATE')) from generate_series(1,201) g), true)$q$, pg_temp.job()), 'X9 серверный предел 200 значений сохранён', 'Не больше 200');
select pg_temp.err_as('C', format($q$select import_orgmap_apply(%L::uuid, '[{"kind":"UNIT","src_name":"x","scope":"","action":"CREATE"}]'::jsonb, false, null)$q$, pg_temp.job()), 'X10 сохранение без причины отвергается', 'причин');
select pg_temp.ok((select count(*)>=81 from audit_log where table_name='org_units' and action='INSERT'), 'X12 создание отделов попало в журнал аудита');

do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
