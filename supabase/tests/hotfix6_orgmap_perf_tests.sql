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
create or replace function pg_temp.pathrec(n int) returns bigint language sql as $$ select id from org_units where level='DEPARTMENT' and name like '% → Подотдел '||n $$;
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
-- справочник: 14 департаментов, 97 «обычных» отделов, 241 запись-путь и отделы для проверки причин (похожие, у другого родителя, неактивные, псевдонимы)
insert into org_units(name, level) select 'Департамент '||g, 'DEPARTMENT' from generate_series(1,14) g;
insert into org_units(name, level, parent_id) select 'Отдел существующий '||g, 'UNIT', pg_temp.dept('Департамент '||(1+g%14)) from generate_series(1,97) g;
insert into org_units(name, level) select 'Департамент '||(1+g%14)||' → Подотдел '||g, 'DEPARTMENT' from generate_series(1,241) g;
insert into org_units(name, level, parent_id) select 'Лаборатория А'||g, 'UNIT', pg_temp.dept('Департамент '||(1+g%14)) from generate_series(1,12) g;          -- «похожие» для групп 93..104
insert into org_units(name, level, parent_id) select 'Склад '||g, 'UNIT', pg_temp.dept('Департамент '||(1+(g+1)%14)) from generate_series(105,109) g;                -- такой же отдел у ДРУГОГО департамента: группы 105..109
insert into org_units(name, level, parent_id, is_active) select 'Цех '||g, 'UNIT', pg_temp.dept('Департамент '||(1+g%14)), false from generate_series(110,112) g;       -- неактивные: группы 110..112
insert into org_unit_aliases(org_unit_id, alias_norm)
  select (select id from org_units where name = 'Отдел существующий '||(g-100)), norm_name('Бухгалтерия '||g) from generate_series(113,114) g;                           -- псевдоним у другого департамента: группы 113..114
insert into k values ('job', gen_random_uuid()::text);
insert into import_jobs(id, entity, source, file_name, status, total_rows, review_rows, inserted, skipped, conflicts, created_by)
  values (pg_temp.job(),'EMPLOYEES','XLSX','prod-like.xlsx','COMMITTED',2646,876,1770,876,876,'00000000-0000-0000-0000-00000000000a');
insert into import_job_rows(job_id,row_no,raw,data,status,apply_action,applied_id,processed_at,messages)
select pg_temp.job(), g, jsonb_build_object('ФИО','Сотр '||g,'Отдел','Отдел существующий '||(1+g%97),'Департамент','Департамент '||(1+g%14)),
  jsonb_build_object('full_name','Сотр '||g,'department_id',pg_temp.dept('Департамент '||(1+g%14)),'unit_id',1), 'NEW','CREATED',gen_random_uuid(),now(),array['Подразделение найдено в справочнике']
from generate_series(1,1770) g;
-- 114 значений, 855 строк. Группы 1..27 — департамент из файла «Деп-из-файла 1», 28..33 — «Деп-из-файла 2»: оба ранее сопоставлены с записями-путями (как 172 и 74 в Production)
create temp table _grp as
select i, case when i<=92 then 'Отдел новый '||i||' (Опт)'
               when i<=104 then 'Лаборатория Т'||i
               when i<=109 then 'Склад '||i
               when i<=112 then 'Цех '||i
               else 'Бухгалтерия '||i end as nm,
       case when i<=27 then 'Деп-из-файла 1' when i<=33 then 'Деп-из-файла 2' else 'Департамент '||(1+i%14) end as dept_raw,
       case when i<=27 then pg_temp.pathrec(1) when i<=33 then pg_temp.pathrec(2) else pg_temp.dept('Департамент '||(1+i%14)) end as did,
       case when i<=33 then 14 + (i<=24)::int else 4 + (i<=78)::int end n from generate_series(1,114) i;
insert into import_job_rows(job_id,row_no,raw,data,status,apply_action,processed_at,messages,review_code)
select pg_temp.job(), 2000+row_number() over (), jsonb_build_object('ФИО','Сотр н'||g.i||'_'||k,'Отдел',g.nm,'Департамент',g.dept_raw,'Полный путь подразделения','Правление / '||g.dept_raw||' / Подотдел / '||g.nm),
  jsonb_build_object('full_name','Сотр н'||g.i,'department_id',g.did) || case when g.i<=27 and k=1 then jsonb_build_object('unit_id',1) else '{}'::jsonb end,'NEEDS_REVIEW','SKIPPED',now(), array['Отдел «'||g.nm||'» не найден'],'UNIT_UNKNOWN'
from _grp g cross join lateral generate_series(1,g.n) k;
insert into import_job_rows(job_id,row_no,raw,data,status,apply_action,processed_at,messages,review_code)
select pg_temp.job(), 5000+g, '{"ФИО":"Нечёткий"}', '{}', 'NEEDS_REVIEW','SKIPPED',now(), array['Требуется решение по сотруднику'],'EMPLOYEE_FUZZY' from generate_series(1,21) g;
-- 3 сохранённых сопоставления: два департамента → записи-пути, один отдел → другой отдел («Б3» → «Б1»: технически допустимо, поймать может только человек)
alter table import_org_mappings disable trigger import_org_mappings_check;
insert into import_org_mappings(job_id,kind,src_name,src_norm,scope,org_unit_id,reason)
 select pg_temp.job(),'DEPARTMENT','Деп-из-файла '||g,norm_name('Деп-из-файла '||g),'',pg_temp.pathrec(g),'x' from generate_series(1,2) g;
insert into import_org_mappings(job_id,kind,src_name,src_norm,scope,org_unit_id,reason)
 values (pg_temp.job(),'UNIT','Бройлерная птицефабрика Б3',norm_name('Бройлерная птицефабрика Б3'),'P:'||pg_temp.dept('Департамент 1'),(select id from org_units where name='Отдел существующий 5'),'x');
alter table import_org_mappings enable trigger import_org_mappings_check;
analyze import_job_rows; analyze org_units;
delete from audit_log;
create temp table _applied0 as select id, md5(data::text || coalesce(applied_id::text,'') || messages::text) h from import_job_rows where apply_action='CREATED';
create temp table _org0 as select count(*) n, md5(string_agg(id||name||coalesce(parent_id::text,''), ',' order by id)) h from org_units;

-- снимок всего, что сопоставление может изменить; сравнивается до и после (хеши полных строк, не только счётчики)
create or replace function pg_temp.snap() returns jsonb language sql as $$
  select jsonb_build_object(
    'mappings', (select md5(coalesce(string_agg(row_to_json(m)::text,'|' order by id),'')) from import_org_mappings m),
    'org_units', (select md5(coalesce(string_agg(row_to_json(u)::text,'|' order by id),'')) from org_units u),
    'aliases', (select md5(coalesce(string_agg(row_to_json(a)::text,'|' order by id),'')) from org_unit_aliases a),
    'rows_not_applied', (select md5(coalesce(string_agg(row_to_json(r)::text,'|' order by id),'')) from import_job_rows r where apply_action is distinct from 'CREATED'),
    'rows_applied', (select md5(coalesce(string_agg(row_to_json(r)::text,'|' order by id),'')) from import_job_rows r where apply_action = 'CREATED'),
    'audit', (select count(*) from audit_log)) $$;

-- ====================== P. Эквивалентность быстрых функций прежним ======================
-- P1: ВСЕ пары: названия справочника (352 + добавленные отделы), названия значений из файла, граничные названия — в обоих направлениях
create temp table _names as
 select n, import_orgmap_pfx(n) pfx from (select distinct norm_name(x) n from (
   select name x from org_units union select nm from _grp union select dept_raw from _grp
   union select unnest(array['Отдел продажа комбикормов','Отдел продаж комбикормов','Лаборатория А1','Лаборатория Т1','СО Анхор','СО Анхор 3','Управление отдел','Отдел кадров','Отдел кадр','Центр сервиса','Центр сервис',
     'Бройлерная птицефабрика Б3','Бройлерная птицефабрика Б1','Птицефабрика яичного производства Д1','абв','абвг','Департамент снабжения','Департамент дистрибуции охлажденных и замореженных продуктов',
     'Департамент дистрибуции охлажденных и замороженных продуктов','Отдел проектирование новых проектов','Отдел проектирования новых проектов','0111 Отдел СТТ (Опт)','041 Отдел продаж Хатлон 2 (Опт)','','а'])) q) w;
create temp table _p1 as
 select count(*) pairs, count(*) filter (where import_orgmap_similar(a.n,b.n)) pos,
        count(*) filter (where import_orgmap_similar(a.n,b.n) is distinct from import_orgmap_similar_fast(a.n,b.n,a.pfx,b.pfx)) diff
   from _names a cross join _names b;
select pg_temp.ok((select diff=0 and pos > 1000 and pairs-pos > 1000 from _p1), 'P1 «похоже» по токенам == прежнее условие на ВСЕХ парах (в обоих направлениях); есть и «да», и «нет»');
insert into res(name, ok, detail) select 'P1i сведения о покрытии', true, pairs||' пар, из них «похожи» '||pos||', расхождений '||diff from _p1;
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
select pg_temp.ok((select count(*)=3 and count(*) filter (where m->>'invalid' is not null)=2 and bool_or(m->>'kind'='UNIT' and m->>'invalid' is null) from _scan, jsonb_array_elements(s->'mappings') m),
   'S4 из 3 сопоставлений 2 (к записям-путям) помечены недопустимыми; «Б3→Б1» формально допустимо — его снимает только человек');
select pg_temp.ok((select (select count(*) from jsonb_array_elements(s->'groups_list') g where g->>'scope_label' like '%запись-путь%')=33 from _scan), 'S5 33 значения в контексте записи-пути помечены, 114 в списке');
select pg_temp.ok((select not exists (select 1 from jsonb_array_elements(s->'groups_list') g, jsonb_array_elements(g->'candidates') c where c->>'kind'='PATH_RECORD' and (c->>'allowed')::boolean) from _scan), 'S6 запись-путь никогда не «допустимый кандидат»');
select pg_temp.ok((select jsonb_array_length(s->'groups_list')=114 from _scan), 'S7 все группы возвращены одной страницей');
select pg_temp.ok((select (select count(*) from (
     select g->>'kind' k, g->>'scope' sc, g->>'src_norm' n from jsonb_array_elements(pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 50, 0)::text$q$, pg_temp.job()))->'groups_list') g
     union all select g->>'kind', g->>'scope', g->>'src_norm' from jsonb_array_elements(pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 50, 50)::text$q$, pg_temp.job()))->'groups_list') g
     union all select g->>'kind', g->>'scope', g->>'src_norm' from jsonb_array_elements(pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 50, 100)::text$q$, pg_temp.job()))->'groups_list') g) q)=114), 'S8 постраничный скан (50+50+14) даёт те же 114 значений');
-- S9: кандидаты каждой группы == набор, который даёт прежнее (M28) условие отбора по справочнику
select pg_temp.ok((select count(*)=0 from _scan, jsonb_array_elements(s->'groups_list') g
   cross join lateral (select coalesce(array_agg((c->>'id')::bigint order by (c->>'id')::bigint), '{}') got from jsonb_array_elements(g->'candidates') c) a
   cross join lateral (select coalesce(array_agg(u.id order by u.id), '{}') exp from org_units u
        where norm_name(u.name) = g->>'src_norm'
           or exists (select 1 from org_unit_aliases al where al.org_unit_id = u.id and al.alias_norm = g->>'src_norm')
           or (u.level = 'DEPARTMENT' and org_is_path_record(u.name) and norm_name((regexp_match(u.name, ' → ([^→]*)$'))[1]) = g->>'src_norm')
           or (u.level::text = g->>'kind' and not org_is_path_record(u.name) and import_orgmap_similar(g->>'src_norm', norm_name(u.name)))) e
   where not ((cardinality(e.exp) <= 8 and a.got = e.exp) or (cardinality(e.exp) > 8 and cardinality(a.got) = 8 and a.got <@ e.exp))), 'S9 кандидаты скана == отбор по прежнему условию для каждой из 114 групп');
select pg_temp.ok((select count(*) filter (where jsonb_array_length(g->'candidates') > 0) >= 22 from _scan, jsonb_array_elements(s->'groups_list') g), 'S9i в наборе не менее 22 групп с непустыми кандидатами (иначе сверка S9 пуста)');
-- S10: причины, посчитанные независимо по построению набора
select pg_temp.ok((select (s#>'{by_cause,PARENT_UNRESOLVED}'->>'groups')::int=33 and (s#>'{by_cause,PARENT_UNRESOLVED}'->>'rows')::int=486
                     and (s#>'{by_cause,MISSING}'->>'groups')::int=59 and (s#>'{by_cause,MISSING}'->>'rows')::int=281
                     and (s#>'{by_cause,SIMILAR}'->>'groups')::int=12 and (s#>'{by_cause,OTHER_PARENT}'->>'groups')::int=5
                     and (s#>'{by_cause,INACTIVE}'->>'groups')::int=3 and (s#>'{by_cause,ALIAS_OTHER_PARENT}'->>'groups')::int=2 from _scan),
   'S10 причины: 33 «сначала департамент» (486 строк), 59 «нигде нет» (281), 12 похожих, 5 у другого родителя, 3 неактивных, 2 псевдонима');

-- ====================== T. Время и отмена ======================
create temp table _items_ok as
 select jsonb_agg(jsonb_build_object('kind','UNIT','src_name',nm,'scope','P:'||did,'action','CREATE')) j from _grp where i between 34 and 92;
create or replace function pg_temp.timed(p_sql text) returns numeric language plpgsql as $$
declare t0 timestamptz := clock_timestamp();
begin perform pg_temp.rv('C', p_sql); return extract(epoch from clock_timestamp()-t0); end $$;
select pg_temp.ok(pg_temp.timed(format($q$select import_orgmap_scan(%L::uuid, 500, 0)::text$q$, pg_temp.job())) < 4, 'T1 скан набора Production укладывается в 4 с (лимит роли 8 с)');
select pg_temp.ok(pg_temp.timed(format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.job(), (select j from _items_ok))) < 4, 'T2 предпросмотр 59 значений < 4 с');
create temp table _snap_t0 as select pg_temp.snap() s;
select pg_temp.ok((select pg_temp.snap() = s from _snap_t0), 'T3 предпросмотр ничего не записал (снимок всего состояния совпал)');
select pg_temp.ok((pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.job(), (select j from _items_ok))))->>'ok' = '59', 'T4 предпросмотр: все 59 значений «ok»');

-- Отмена ПОСЛЕ начала изменений. Тестовый триггер (создаётся и откатывается только в этом тесте; в коде миграции нет задержек) срабатывает на 3-й
-- вставке отдела и фиксирует в несбрасываемых при откате последовательностях, что к этому моменту уже сделано: сколько отделов вставлено, сколько строк
-- уже возвращено в «департамент не найден» и сколько сопоставлений осталось. Пакет: снять 2 сопоставления департаментов (меняет строки), затем 5 отделов.
create sequence t_probe_units; create sequence t_probe_rows; create sequence t_probe_maps;
grant usage, select, update on t_probe_units, t_probe_rows, t_probe_maps to authenticated;
create function t_probe_trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.name like 'Отдел новый % (Опт)' and nextval('t_probe_units') = 3 then
    perform setval('t_probe_rows', greatest(1, (select count(*) from import_job_rows where messages @> array['Подразделение «Деп-из-файла 1» не найдено'])));
    perform setval('t_probe_maps', 1 + (select count(*) from import_org_mappings));
    if current_setting('t.mode', true) = 'sleep' then perform pg_sleep(8);
    else raise exception 'тестовая отмена запроса после начала изменений' using errcode = '57014'; end if;
  end if;
  return new;
end $$;
create trigger t_probe after insert on org_units for each row execute function t_probe_trg();
create temp table _items_cancel as
 select jsonb_build_array(jsonb_build_object('kind','DEPARTMENT','src_name','Деп-из-файла 1','scope','','action','CLEAR'),
                          jsonb_build_object('kind','DEPARTMENT','src_name','Деп-из-файла 2','scope','','action','CLEAR'))
        || (select jsonb_agg(jsonb_build_object('kind','UNIT','src_name',nm,'scope','P:'||did,'action','CREATE')) from _grp where i between 34 and 38) j;
create or replace function pg_temp.cancel_run(p_mode text, p_items jsonb, p_job uuid) returns text language plpgsql as $$
declare v text := 'нет ошибки';
begin
  perform set_config('t.mode', p_mode, true);
  perform set_config('request.jwt.claim.sub', pg_temp.uid('C'), true); set local role authenticated;
  begin perform import_orgmap_apply(p_job, p_items, false, 'тест отмены');
  exception when query_canceled then v := 'query_canceled ' || sqlstate; end;
  reset role;
  return v;
end $$;
create temp table _cancel_res(mode text, err text, before jsonb, after jsonb, units int, rows_at_cancel int, maps_at_cancel int);
-- A: отмена 57014 из-под вставки (точка отмены не зависит от скорости машины)
create temp table _snap_a as select pg_temp.snap() s;
insert into _cancel_res(mode, err, before) select 'raise', pg_temp.cancel_run('raise', (select j from _items_cancel), pg_temp.job()), s from _snap_a;
update _cancel_res set after = pg_temp.snap(), units = (select last_value from t_probe_units)::int, rows_at_cancel = (select last_value from t_probe_rows)::int, maps_at_cancel = (select last_value from t_probe_maps)::int - 1 where mode = 'raise';
select pg_temp.ok((select err = 'query_canceled 57014' from _cancel_res where mode='raise'), 'T5a отмена приходит как query_canceled (57014)');
select pg_temp.ok((select units = 3 and rows_at_cancel = 402 and maps_at_cancel = 1 from _cancel_res where mode='raise'),
   'T5b к моменту отмены изменения уже были: 3 отдела вставлены, 402 строки возвращены в «департамент не найден», сопоставлений осталось 1 из 3');
select pg_temp.ok((select before = after from _cancel_res where mode='raise'), 'T6a после отмены состояние == исходному: сопоставления, справочник, псевдонимы, неприменённые строки, 1770 применённых, журнал аудита');
-- B: настоящий таймер: statement_timeout и пауза внутри триггера после начала изменений
select setval('t_probe_units', 1, false), setval('t_probe_rows', 1, false), setval('t_probe_maps', 1, false);
create temp table _snap_b as select pg_temp.snap() s;
set local statement_timeout = '2500ms';
insert into _cancel_res(mode, err, before) select 'timer', pg_temp.cancel_run('sleep', (select j from _items_cancel), pg_temp.job()), s from _snap_b;
reset statement_timeout;
update _cancel_res set after = pg_temp.snap(), units = (select last_value from t_probe_units)::int, rows_at_cancel = (select last_value from t_probe_rows)::int, maps_at_cancel = (select last_value from t_probe_maps)::int - 1 where mode = 'timer';
select pg_temp.ok((select err = 'query_canceled 57014' from _cancel_res where mode='timer'), 'T5c настоящий statement_timeout даёт query_canceled (57014)');
select pg_temp.ok((select units = 3 and rows_at_cancel = 402 and maps_at_cancel = 1 from _cancel_res where mode='timer'), 'T5d таймер сработал после начала изменений (3 отдела, 402 строки, 1 сопоставление)');
select pg_temp.ok((select before = after from _cancel_res where mode='timer'), 'T6b после таймаута состояние == исходному (все хеши и журнал аудита)');
select pg_temp.ok((select count(*)=0 from _applied0 a join import_job_rows r using (id) where md5(r.data::text || coalesce(r.applied_id::text,'') || r.messages::text) <> a.h), 'T7 1770 применённых строк не затронуты');
drop trigger t_probe on org_units; drop function t_probe_trg();

-- ====================== D. Снятие сопоставления департамента: реальные значения и состояние строк ======================
-- Цели: строки группы «Деп-из-файла 1» (raw «Департамент» = название сопоставления, data.department_id = запись-путь). Двойники, которые менять нельзя:
insert into import_jobs(id, entity, source, file_name, status, total_rows, created_by)
  values ('11111111-1111-1111-1111-111111111111','EMPLOYEES','XLSX','other.xlsx','COMMITTED',1,'00000000-0000-0000-0000-00000000000a');
create temp table _decoy(name text, id bigint);
with ins as (
  insert into import_job_rows(job_id,row_no,raw,data,status,apply_action,decision,applied_id,processed_at,messages,review_code)
  select j, n, raw, data, st, act, dec, app, now(), msgs, 'UNIT_UNKNOWN' from (values
    (pg_temp.job(), 7001, '{"Департамент":"Другой департамент","Отдел":"Х1"}'::jsonb, jsonb_build_object('department_id', pg_temp.pathrec(1)), 'NEEDS_REVIEW','SKIPPED', null, null::uuid, array['Отдел «Х1» не найден'], 'другое значение при том же department_id'),
    (pg_temp.job(), 7002, '{"Департамент":"Деп-из-файла 1","Отдел":"Х2"}'::jsonb, jsonb_build_object('department_id', pg_temp.pathrec(1)), 'NEEDS_REVIEW','SKIPPED', 'SKIP', null, array['Отдел «Х2» не найден'], 'есть решение'),
    (pg_temp.job(), 7003, '{"Департамент":"Деп-из-файла 1","Отдел":"Х3"}'::jsonb, jsonb_build_object('department_id', pg_temp.pathrec(1)), 'NEW','CREATED', null, gen_random_uuid(), array['Подразделение найдено в справочнике'], 'уже применена'),
    (pg_temp.job(), 7004, '{"Департамент":"Деп-из-файла 1","Отдел":"Х4"}'::jsonb, '{"full_name":"x"}'::jsonb, 'NEEDS_REVIEW','SKIPPED', null, null, array['Подразделение «Деп-из-файла 1» не найдено','Отдел «Х4» не найден'], 'уже «не найден»'),
    (pg_temp.job(), 7005, '{"Департамент":"Деп-из-файла 1","Отдел":"Х5"}'::jsonb, jsonb_build_object('department_id', pg_temp.dept('Департамент 3')), 'NEEDS_REVIEW','SKIPPED', null, null, array['Отдел «Х5» не найден'], 'другой department_id'),
    ('11111111-1111-1111-1111-111111111111'::uuid, 1, '{"Департамент":"Деп-из-файла 1","Отдел":"Х6"}'::jsonb, jsonb_build_object('department_id', pg_temp.pathrec(1)), 'NEEDS_REVIEW','SKIPPED', null, null, array['Отдел «Х6» не найден'], 'другое задание')
  ) v(j, n, raw, data, st, act, dec, app, msgs, name) returning id, row_no)
insert into _decoy select row_no::text, id from ins;
create temp table _a1 as   -- цели CLEAR «Деп-из-файла 1»: что должно измениться
  select id, data, messages from import_job_rows where job_id = pg_temp.job() and status = 'NEEDS_REVIEW' and decision is null and applied_id is null
     and raw->>'Департамент' = 'Деп-из-файла 1' and data->>'department_id' = pg_temp.pathrec(1)::text and not (messages::text like '%Подразделение «%');
create temp table _a2 as
  select id, data, messages from import_job_rows where job_id = pg_temp.job() and raw->>'Департамент' = 'Деп-из-файла 2' and data->>'department_id' = pg_temp.pathrec(2)::text;
select pg_temp.ok((select (select count(*) from _a1)=402 and (select count(*) from _a2)=84 and (select count(*) from _decoy)=6), 'D0 исходные цели: 402 строки «Деп-из-файла 1», 84 строки «Деп-из-файла 2», 6 двойников');
create temp table _rest0 as select id, md5(row_to_json(r)::text) h from import_job_rows r where id not in (select id from _a1);
create temp table _snap_d0 as select pg_temp.snap() s;
create temp table _dry as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, '[{"kind":"DEPARTMENT","src_name":"Деп-из-файла 1","scope":"","action":"CLEAR"}]'::jsonb, true)::text$q$, pg_temp.job())) r;
select pg_temp.ok((select (r#>>'{items,0,rows}')::int = 402 and (r#>>'{items,0,changed}')::boolean from _dry), 'D1 предпросмотр CLEAR: покажет 402 строки к возврату');
select pg_temp.ok((select pg_temp.snap() = s from _snap_d0), 'D2 предпросмотр CLEAR не записал ничего (хеши всех строк, сопоставлений, справочника)');
create temp table _clr as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, '[{"kind":"DEPARTMENT","src_name":"Деп-из-файла 1","scope":"","action":"CLEAR"}]'::jsonb, false, 'снять')::text$q$, pg_temp.job())) r;
select pg_temp.ok((select (r#>>'{items,0,rows}')::int = 402 and (r#>>'{items,0,changed}')::boolean and (r->>'failed')::int = 0 from _clr), 'D3 CLEAR: сообщает 402 возвращённые строки');
select pg_temp.ok((select count(*) = 0 from import_org_mappings where job_id = pg_temp.job() and src_norm = norm_name('Деп-из-файла 1')) and (select count(*) = 2 from import_org_mappings where job_id = pg_temp.job()), 'D4 снято ровно одно сопоставление (2 других остались)');
select pg_temp.ok((select count(*) = 402 and bool_and(
        not (r.data ? 'department_id') and not (r.data ? 'unit_id')
        and r.data = a.data - 'department_id' - 'unit_id'
        and r.messages = a.messages || array['Подразделение «Деп-из-файла 1» не найдено'])
     from _a1 a join import_job_rows r using (id)), 'D5 у каждой из 402 строк: department_id убран, прочие поля data сохранены, сообщения == прежние + «Подразделение «Деп-из-файла 1» не найдено»');
select pg_temp.ok((select count(*) = 0 from _rest0 z join import_job_rows r using (id) where md5(row_to_json(r)::text) <> z.h), 'D6 все остальные строки (применённые 1770, двойники, группа «Деп-из-файла 2», другое задание) — побайтно прежние');
select pg_temp.ok((select (select count(*) from _decoy) = 6 and count(*) = 6 from _decoy d join _rest0 using (id)), 'D6i двойники входят в проверенный набор (6 из 6)');
-- повтор: ничего не меняется, сообщения не дублируются
create temp table _snap_d1 as select pg_temp.snap() s;
create temp table _clr2 as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, '[{"kind":"DEPARTMENT","src_name":"Деп-из-файла 1","scope":"","action":"CLEAR"}]'::jsonb, false, 'повтор')::text$q$, pg_temp.job())) r;
select pg_temp.ok((select (r#>>'{items,0,changed}')::boolean = false and (r#>>'{items,0,rows}')::int = 0 and (r->>'failed')::int = 0 from _clr2) and (select pg_temp.snap() = s from _snap_d1), 'D7 повторное снятие: changed=false, rows=0, ни одна строка и ни одно сообщение не изменены (хеши, журнал аудита)');
-- скан после: 27 значений отделов теперь ждут департамент «Деп-из-файла 1»
create temp table _scan2 as select pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 500, 0)::text$q$, pg_temp.job())) s;
-- +1 строка и +1 значение — двойник 7004, у которого сообщение «Подразделение … не найдено» уже было до снятия
select pg_temp.ok((select (select (g->>'rows')::int from jsonb_array_elements(s->'groups_list') g where g->>'kind'='DEPARTMENT' and g->>'src_name'='Деп-из-файла 1') = 403
                      and (select count(*) from jsonb_array_elements(s->'groups_list') g where g->>'kind'='UNIT' and g->>'scope' = 'D:'||norm_name('Деп-из-файла 1') and g->>'cause'='PARENT_UNRESOLVED') = 28 from _scan2),
   'D8 скан: значение департамента «Деп-из-файла 1» (402 возвращённые + 1 уже бывшая = 403 строки) и 28 значений отделов (27 + «Х4») с причиной «сначала департамент»');
-- CLEAR отдела не трогает строки
create temp table _snap_d2 as select pg_temp.snap() s;
select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, '[{"kind":"UNIT","src_name":"Бройлерная птицефабрика Б3","scope":"P:%s","action":"CLEAR"}]'::jsonb, false, 'снять отдел')::text$q$, pg_temp.job(), pg_temp.dept('Департамент 1')));
select pg_temp.ok((select (select count(*) from import_org_mappings where job_id = pg_temp.job() and kind = 'UNIT') = 0 and (pg_temp.snap() - 'mappings' - 'audit') = ((select s from _snap_d2) - 'mappings' - 'audit')), 'D9 снятие сопоставления отдела удаляет его и не меняет ни одной строки');

-- CLEAR и следующее действие в ОДНОЙ пачке: счётчики строк после CLEAR пересчитаны. Без пересчёта 2-е и 3-е значения показали бы 0 строк (до CLEAR у них другие ключи).
create temp table _bt as select jsonb_build_array(
    jsonb_build_object('kind','DEPARTMENT','src_name','Деп-из-файла 2','scope','','action','CLEAR'),
    jsonb_build_object('kind','DEPARTMENT','src_name','Деп-из-файла 2','scope','','action','CREATE','name','Деп-из-файла 2'),
    jsonb_build_object('kind','UNIT','src_name','Отдел новый 28 (Опт)','scope','D:'||norm_name('Деп-из-файла 2'),'action','CREATE')) j;
create temp table _bt_snap as select pg_temp.snap() s;
create temp table _bt_dry as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, true)::text$q$, pg_temp.job(), (select j from _bt))) r;
select pg_temp.ok((select (r->>'ok')::int = 3 and (r->>'failed')::int = 0
                      and (r#>>'{items,0,rows}')::int = 84      -- CLEAR: вернул 84 строки
                      and (r#>>'{items,1,rows}')::int = 84      -- создание департамента: видит ровно эти 84 строки, возвращённые CLEAR этой же пачки
                      and (r#>>'{items,2,rows}')::int = 14      -- отдел группы 28: 14 строк, у которых контекст стал «D:деп-из-файла 2» только после CLEAR
                   from _bt_dry), 'D10 пачка CLEAR + создание департамента + создание отдела: счётчики 84 / 84 / 14 отражают состояние строк после CLEAR (предпросмотр)');
select pg_temp.ok((select pg_temp.snap() = s from _bt_snap), 'D10i предпросмотр этой пачки ничего не записал');
create temp table _bt_real as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'пачка')::text$q$, pg_temp.job(), (select j from _bt))) r;
select pg_temp.ok((select (r->>'ok')::int = 3 and (r->>'failed')::int = 0 and (r#>>'{items,1,rows}')::int = 84 and (r#>>'{items,2,rows}')::int = 14 and (r->>'created')::int = 2 from _bt_real), 'D11 то же при сохранении: 84 / 84 / 14, создано 2');
select pg_temp.ok((select count(*) = 1 from org_units d join org_units u on u.parent_id = d.id where d.name = 'Деп-из-файла 2' and d.level = 'DEPARTMENT' and d.parent_id is null and u.name = 'Отдел новый 28 (Опт)' and u.level = 'UNIT'), 'D12 создан департамент «Деп-из-файла 2» и в нём отдел «Отдел новый 28 (Опт)»');
select pg_temp.ok((select count(*) = 84 and bool_and(not (r.data ? 'department_id') and r.messages = a.messages || array['Подразделение «Деп-из-файла 2» не найдено']) from _a2 a join import_job_rows r using (id)), 'D13 84 строки «Деп-из-файла 2» возвращены, сообщения == прежние + одно новое');
select pg_temp.ok((select (g->>'cause') = 'RESOLVABLE' and (g->>'rows')::int = 14 from (select pg_temp.rj('C', format($q$select import_orgmap_scan(%L::uuid, 500, 0)::text$q$, pg_temp.job())) s) x, jsonb_array_elements(s->'groups_list') g where g->>'src_name' = 'Отдел новый 28 (Опт)'), 'D14 скан после пачки: значение «Отдел новый 28» теперь находится (RESOLVABLE, 14 строк)');

-- ====================== R. Сохранение, повтор, возобновление ======================
create temp table _r1 as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'тест')::text$q$, pg_temp.job(), (select j from _items_ok))) r;
select pg_temp.ok((select (r->>'ok')::int=59 and (r->>'created')::int=59 and (r->>'failed')::int=0 from _r1), 'R1 сохранение 59 отделов: создано 59, ошибок 0');
select pg_temp.ok((select count(*)=59 from org_units where name like 'Отдел новый % (Опт)' and name <> 'Отдел новый 28 (Опт)' and level='UNIT' and parent_id is not null), 'R2 отделы созданы именно как отделы с родителем-департаментом');
select pg_temp.ok((select count(*)=0 from org_units u join org_units p on p.id=u.parent_id where u.level='UNIT' and org_is_path_record(p.name)), 'R3 ни одного отдела под записью-путём');
select pg_temp.ok((select (r->>'rows_affected')::int = (select sum(n::int) from jsonb_each_text(import_orgmap_row_counts(pg_temp.job())) e(key, n) where split_part(key, chr(31), 3) in (select norm_name(nm) from _grp where i between 34 and 92)) from _r1), 'R4 «затронуто строк» совпадает с числом строк этих значений');
create temp table _r2 as select pg_temp.rj('C', format($q$select import_orgmap_apply(%L::uuid, %L::jsonb, false, 'повтор')::text$q$, pg_temp.job(), (select j from _items_ok))) r;
select pg_temp.ok((select (r->>'created')::int=0 and (r->>'failed')::int=59 from _r2) and (select count(*)=60 from org_units where name like 'Отдел новый % (Опт)'), 'R5 повторный запуск тех же значений: ничего не дублируется (59 отказов «уже есть»)');
create temp table _ra as select pg_temp.rj('C', format($q$select import_orgmap_reanalyze_batch(%L::uuid, 100, 0)::text$q$, pg_temp.job())) r;
select pg_temp.ok((select (r->>'processed')::int<=100 from _ra), 'R6 перепроверка пачкой ≤100 строк');
select pg_temp.ok((select count(*)=1771 from import_job_rows where job_id=pg_temp.job() and apply_action='CREATED') and (select count(*)=0 from _applied0 a join import_job_rows r using (id) where md5(r.data::text || coalesce(r.applied_id::text,'') || r.messages::text) <> a.h), 'R7 после сохранения и перепроверки применённые строки (1770 + двойник 7003) не изменились');

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
select pg_temp.ok((select count(*)>=59 from audit_log where table_name='org_units' and action='INSERT'), 'X12 создание отделов попало в журнал аудита');
-- чужое задание: через job id первого задания нельзя изменить строки второго
select pg_temp.ok((select count(*)=1 and bool_and(data->>'department_id' = pg_temp.pathrec(1)::text and messages = array['Отдел «Х6» не найден']) from import_job_rows where job_id = '11111111-1111-1111-1111-111111111111'), 'X13 строки другого задания (с теми же значениями) не изменены ни одним из действий');

do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
