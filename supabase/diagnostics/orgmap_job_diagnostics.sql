-- Диагностика оргструктуры задания импорта сотрудников (ТОЛЬКО ЧТЕНИЕ: ни одна строка и ни одна запись справочника не меняется).
-- По каждому уникальному значению отдела/департамента из файла: сколько строк, откуда (департамент и полный путь из файла), в каком департаменте
-- ищется, какие кандидаты уже есть в справочнике (с путями) и почему точного совпадения нет. Автоназначения по сходству названий здесь нет:
-- «предложение» — лишь подсказка для человека, подтверждать его нужно в панели сопоставления (предпросмотр → сохранить с причиной).
-- Персональных данных (ФИО, коды, телефоны) не выводит. Требует M27 (import_orgmap_parse) и M28 (org_is_path_record).
-- Использование: подставьте id задания в :job (psql -v job="'<uuid>'") либо замените :job на литерал в строке ниже.
with p as (
  select r.id, r.row_no, r.raw, r.data, x.kind, x.name, x.scope, norm_name(x.name) as nn
    from import_job_rows r cross join lateral import_orgmap_parse(r.messages, r.data) x
   where r.job_id = :job::uuid and r.status = 'NEEDS_REVIEW' and r.decision is null and r.applied_id is null
     and r.apply_action is distinct from 'CREATED' and r.apply_action is distinct from 'UPDATED'),
g as (
  select kind, scope, nn, min(name) as src_name, count(distinct id) as nrows, (array_agg(id order by row_no))[1] as first_id
    from p group by kind, scope, nn)
select g.kind as "вид", g.src_name as "значение из файла", g.nrows as "строк",
       -- путь из файла: значение с «/», последний сегмент которого совпадает с отделом
       (select kv.value from jsonb_each_text((select raw from import_job_rows where id = g.first_id and jsonb_typeof(raw) = 'object')) kv
         where g.kind = 'UNIT' and kv.value like '%/%' and norm_name(trim((regexp_match(kv.value, '([^/]*)$'))[1])) = g.nn limit 1) as "полный путь в файле",
       case when g.scope like 'P:%' then substr(g.scope, 3)::bigint end as "id департамента в контексте",
       (select u.name from org_units u where g.scope like 'P:%' and u.id = substr(g.scope, 3)::bigint) as "департамент в контексте",
       coalesce((select org_is_path_record(u.name) from org_units u where g.scope like 'P:%' and u.id = substr(g.scope, 3)::bigint), false) as "контекст — запись-путь",
       (select string_agg(mp.src_name, '; ') from import_org_mappings mp where mp.job_id = :job::uuid and mp.kind = 'DEPARTMENT' and g.scope like 'P:%' and mp.org_unit_id = substr(g.scope, 3)::bigint) as "департамент из файла (по сопоставлению)",
       (select string_agg(u.id || ': ' || coalesce(pp.name || ' › ', '') || u.name, '; ') from org_units u left join org_units pp on pp.id = u.parent_id
         where u.is_active and u.level::text = g.kind and norm_name(u.name) = g.nn) as "точное название (любой департамент)",
       (select string_agg(u.id || ': ' || u.name, '; ') from org_units u
         where u.level = 'DEPARTMENT' and org_is_path_record(u.name) and norm_name((regexp_match(u.name, ' → ([^→]*)$'))[1]) = g.nn) as "записи-пути с таким хвостом",
       (select string_agg(u.id || ': ' || coalesce(pp.name || ' › ', '') || u.name, '; ') from org_units u left join org_units pp on pp.id = u.parent_id
         where u.is_active and u.level::text = g.kind and not org_is_path_record(u.name) and norm_name(u.name) <> g.nn and import_orgmap_similar(g.nn, norm_name(u.name))
           and (g.kind = 'DEPARTMENT' or g.scope not like 'P:%' or u.parent_id = substr(g.scope, 3)::bigint)) as "похожие (в том же департаменте)",
       (select count(*) from org_units u where u.is_active and u.level::text = g.kind and not org_is_path_record(u.name) and norm_name(u.name) <> g.nn and import_orgmap_similar(g.nn, norm_name(u.name))
           and g.kind = 'UNIT' and g.scope like 'P:%' and u.parent_id is distinct from substr(g.scope, 3)::bigint) as "похожих в других департаментах",
       case
         when g.scope like 'P:%' and coalesce((select org_is_path_record(u.name) from org_units u where u.id = substr(g.scope, 3)::bigint), false) then 'Департамент привязан к записи-пути: снять сопоставление департамента, затем создать/выбрать настоящий'
         when g.kind = 'UNIT' and g.scope like 'D:%' then 'Сначала департамент из файла'
         when exists (select 1 from org_units u where u.is_active and u.level::text = g.kind and norm_name(u.name) = g.nn
                         and (g.kind = 'DEPARTMENT' or g.scope not like 'P:%' or u.parent_id is distinct from substr(g.scope, 3)::bigint)) then 'Есть у другого департамента — не привязывается к чужому'
         when exists (select 1 from org_units u where u.level = 'DEPARTMENT' and org_is_path_record(u.name) and norm_name((regexp_match(u.name, ' → ([^→]*)$'))[1]) = g.nn) then 'В справочнике только как запись-путь «A → B» (это не подразделение)'
         else 'Нигде нет в справочнике' end as "почему нет точного совпадения"
  from g order by g.nrows desc, g.src_name;
