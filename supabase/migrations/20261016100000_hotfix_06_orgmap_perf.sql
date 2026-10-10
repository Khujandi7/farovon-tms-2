-- M29: ограничение времени при сопоставлении оргструктуры (первопричина «Операция прервана по ограничению времени»).
-- Причина: import_orgmap_apply на КАЖДОЕ значение заново разбирал все строки задания (O(значения × строки)); import_orgmap_scan на каждое значение
-- заново нормализовал и сравнивал весь справочник (O(значения × подразделения), «похоже» через unnest). Результаты и права не меняются:
-- счётчики строк считаются один раз на пакет, справочник готовится один раз на скан, «похоже» сравнивается по заранее выделенным токенам.
-- Откат: supabase/rollback/rollback_29_orgmap_perf.sql.

-- токены для «похоже»: первые 4 символа слов длиной >= 4, кроме служебных (ровно то условие import_orgmap_similar)
create function import_orgmap_pfx(a text) returns text[]
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(array_agg(distinct left(x, 4)), '{}') from unnest(string_to_array(a, ' ')) x
   where length(x) >= 4 and x <> all (array['отдел','отделение','управление','департамент','участок','служба','группа','сектор','бюро','центр','подразделение'])
$$;

-- то же значение, что import_orgmap_similar(a, b), но по готовым токенам
create function import_orgmap_similar_fast(a text, b text, pa text[], pb text[]) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select (length(a) >= 4 and length(b) >= 4 and (position(a in b) > 0 or position(b in a) > 0)) or (pa && pb)
$$;

-- сколько ещё не решённых строк затрагивает каждое значение: ключ «вид, контекст, нормализованное значение» через chr(31)
create function import_orgmap_row_counts(p_job uuid) returns jsonb
language sql stable set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(t.key, t.n), '{}'::jsonb) from (
    select p.kind || chr(31) || p.scope || chr(31) || norm_name(p.name) as key, count(distinct jr.id) as n
      from import_job_rows jr cross join lateral import_orgmap_parse(jr.messages, jr.data) p
     where jr.job_id = p_job and jr.status = 'NEEDS_REVIEW' and jr.decision is null and jr.applied_id is null
       and jr.apply_action is distinct from 'CREATED' and jr.apply_action is distinct from 'UPDATED'
     group by 1) t
$$;

create or replace function import_orgmap_apply(p_job uuid, p_items jsonb, p_dry boolean default true, p_reason text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; it record; v_reason text; v_out jsonb := '[]'::jsonb; e jsonb; k org_level; v_name text; v_norm text; v_scope text; v_act text; v_target bigint;
        v_rows int; v_changed boolean; v_alias_added boolean; v_created bigint; v_sd bigint; v_parent bigint; v_prev bigint; v_cnt_ok int := 0; v_cnt_fail int := 0;
        v_counts jsonb; v_dirty boolean := false; v_map int := 0; v_alias int := 0; v_create int := 0; v_clear int := 0; v_rows_total int := 0; v_cname text; v_reopen int;
begin
  select * into j from import_jobs where id = p_job;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Сопоставление доступно только для импорта сотрудников' using errcode = 'P0015'; end if;
  if j.status not in ('STAGED', 'COMMITTED') then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Нет значений для сопоставления' using errcode = 'P0015'; end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'Не больше 200 значений за раз' using errcode = 'P0015'; end if;
  if not coalesce(p_dry, true) then
    v_reason := req_reason(p_reason);
    perform 1 from import_jobs where id = p_job for update;   -- последовательность сохранений одного задания
  else v_reason := coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Предпросмотр'); end if;
  perform set_config('app.change_reason', 'Сопоставление оргструктуры импорта «' || left(j.file_name, 100) || '»: ' || v_reason, true);
  v_counts := import_orgmap_row_counts(p_job);   -- один проход по строкам на весь пакет, а не по одному на значение
  begin
    for it in select t.value as v, t.ord from jsonb_array_elements(p_items) with ordinality t(value, ord)
               order by (t.value->>'kind' = 'DEPARTMENT') desc, t.ord loop
      e := jsonb_build_object('index', it.ord, 'kind', it.v->>'kind', 'src_name', it.v->>'src_name', 'scope', coalesce(it.v->>'scope', ''), 'action', it.v->>'action');
      begin
        if it.v->>'kind' not in ('DEPARTMENT', 'UNIT') then raise exception 'Неизвестный вид значения' using errcode = 'P0015'; end if;
        k := (it.v->>'kind')::org_level; v_name := trim(coalesce(it.v->>'src_name', '')); v_norm := norm_name(v_name); v_scope := coalesce(it.v->>'scope', ''); v_act := it.v->>'action';
        if v_norm = '' then raise exception 'Пустое значение' using errcode = 'P0015'; end if;
        if v_scope <> '' and v_scope !~ '^(D:.+|P:[0-9]+)$' then raise exception 'Неверный контекст' using errcode = 'P0015'; end if;
        if k = 'DEPARTMENT' and v_scope <> '' then raise exception 'У департамента нет контекста родителя' using errcode = 'P0015'; end if;
        if v_act not in ('MAP', 'ALIAS', 'CREATE', 'CLEAR') then raise exception 'Неизвестное действие' using errcode = 'P0015'; end if;
        if v_dirty and v_act <> 'CLEAR' then v_counts := import_orgmap_row_counts(p_job); v_dirty := false; end if;
        v_rows := coalesce((v_counts ->> (k::text || chr(31) || v_scope || chr(31) || v_norm))::int, 0);
        v_changed := false; v_alias_added := false; v_created := null;
        if v_act in ('MAP', 'ALIAS') then
          v_target := nullif(it.v->>'org_unit_id', '')::bigint;
          if v_target is null then raise exception 'Не выбрано подразделение' using errcode = 'P0015'; end if;
          perform import_orgmap_check_target(p_job, k, v_scope, v_target);
          if v_act = 'MAP' then
            select org_unit_id into v_prev from import_org_mappings where job_id = p_job and kind = k and src_norm = v_norm and scope = v_scope;
            if v_prev is distinct from v_target then
              insert into import_org_mappings(job_id, kind, src_name, src_norm, scope, org_unit_id, reason) values (p_job, k, v_name, v_norm, v_scope, v_target, v_reason)
              on conflict (job_id, kind, src_norm, scope) do update set org_unit_id = excluded.org_unit_id, src_name = excluded.src_name, reason = excluded.reason, updated_at = now();
              v_changed := true;
            end if;
            v_map := v_map + 1;
          else
            v_alias_added := not exists (select 1 from org_unit_aliases where alias_norm = v_norm and org_unit_id = v_target) and norm_name((select name from org_units where id = v_target)) <> v_norm;
            perform add_org_unit_alias(v_target, v_name, 'Импорт «' || left(j.file_name, 100) || '»: ' || v_reason);
            v_changed := v_alias_added; v_alias := v_alias + 1;
          end if;
        elsif v_act = 'CREATE' then
          v_cname := trim(coalesce(nullif(trim(coalesce(it.v->>'name', '')), ''), v_name));
          if length(v_cname) < 2 or length(v_cname) > 200 or norm_name(v_cname) = '' then raise exception 'Название от 2 до 200 символов' using errcode = 'P0015'; end if;
          perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
          v_parent := null;
          if k = 'UNIT' then
            v_sd := import_orgmap_scope_dept(p_job, v_scope);
            if v_sd is null then raise exception 'Нельзя создать отдел без департамента: сначала сопоставьте или создайте департамент из файла' using errcode = 'P0015'; end if;
            v_parent := v_sd;
          end if;
          if exists (select 1 from org_units where level = k and coalesce(parent_id, 0) = coalesce(v_parent, 0) and norm_name(name) = norm_name(v_cname)) then
            raise exception 'Такое подразделение уже есть (в том числе неактивное) — используйте сопоставление' using errcode = 'P0015'; end if;
          if exists (select 1 from org_unit_aliases a join org_units o on o.id = a.org_unit_id where a.alias_norm = norm_name(v_cname) and o.level = k and coalesce(o.parent_id, 0) = coalesce(v_parent, 0)) then
            raise exception 'Это написание уже закреплено за подразделением — используйте сопоставление' using errcode = 'P0015'; end if;
          if not coalesce((it.v->>'confirm_homonym')::boolean, false) and exists (
               select 1 from org_units o where o.level = k and norm_name(o.name) = norm_name(v_cname)
               union all select 1 from org_unit_aliases a join org_units o on o.id = a.org_unit_id where a.alias_norm = norm_name(v_cname) and o.level = k) then
            raise exception 'Такое название уже есть у другого родителя: подтвердите, что это другое подразделение, или сопоставьте с существующим' using errcode = 'P0015'; end if;
          insert into org_units(parent_id, name, level) values (v_parent, v_cname, k) returning id into v_created;
          v_changed := true; v_create := v_create + 1;
        else   -- CLEAR
          select org_unit_id into v_prev from import_org_mappings where job_id = p_job and kind = k and src_norm = v_norm and scope = v_scope;
          delete from import_org_mappings where job_id = p_job and kind = k and src_norm = v_norm and scope = v_scope;
          v_changed := found; v_clear := v_clear + 1;
          if not v_changed then v_rows := 0; end if; -- повторный CLEAR без сопоставления не должен показывать строки как изменённые
          if v_changed and k = 'DEPARTMENT' then
            -- департамент, подставленный этим сопоставлением в ещё не решённые строки, возвращается в «не найден»; применённые и решённые строки не затрагиваются
            with t as (
              select jr.id, (select kv.value from jsonb_each_text(jr.raw) kv where norm_name(kv.value) = v_norm limit 1) as src
                from import_job_rows jr
               where jr.job_id = p_job and jr.status = 'NEEDS_REVIEW' and jr.decision is null and jr.applied_id is null
                 and jr.apply_action is distinct from 'CREATED' and jr.apply_action is distinct from 'UPDATED'
                 and jsonb_typeof(jr.raw) = 'object' and (jr.data->>'department_id') = v_prev::text
                 and not exists (select 1 from unnest(jr.messages) x where x ~ '^Подразделение «.*» (?:не найдено|неоднозначно)$'))
            update import_job_rows jr set data = jr.data - 'department_id' - 'unit_id', messages = jr.messages || ('Подразделение «' || t.src || '» не найдено')
              from t where jr.id = t.id and t.src is not null;
            get diagnostics v_reopen = row_count;
            v_rows := v_reopen;
            if v_reopen > 0 then v_dirty := true; end if;   -- вернувшиеся строки меняют счётчики отделов: пересчёт один раз, перед следующим не-CLEAR значением
          end if;
        end if;
        v_cnt_ok := v_cnt_ok + 1; v_rows_total := v_rows_total + case when v_act = 'CLEAR' then 0 else v_rows end;
        e := e || jsonb_build_object('ok', true, 'changed', v_changed, 'rows', v_rows, 'alias_added', v_alias_added, 'created_id', v_created);
      exception
        when query_canceled or lock_not_available or deadlock_detected then raise;
        when others then
          v_cnt_fail := v_cnt_fail + 1;
          e := e || jsonb_build_object('ok', false, 'error', left(sqlerrm, 300));
      end;
      v_out := v_out || jsonb_build_array(e);
    end loop;
    if coalesce(p_dry, true) then raise exception 'dry-run' using errcode = 'P0099'; end if;
  exception when sqlstate 'P0099' then null;
  end;
  return jsonb_build_object('dry', coalesce(p_dry, true), 'items', v_out, 'ok', v_cnt_ok, 'failed', v_cnt_fail, 'mapped', v_map, 'aliases', v_alias,
                            'created', v_create, 'cleared', v_clear, 'rows_affected', v_rows_total);
end $$;

create or replace function import_orgmap_scan(p_job uuid, p_limit integer default 300, p_offset integer default 0) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; g record; v_page jsonb := '[]'::jsonb; v_cands jsonb; c record; v_ids bigint[]; v_sd bigint; v_cause text; v_action text; v_n int := 0; v_map bigint; v_units jsonb; v_pfx text[];
        v_allowed boolean; v_why text; v_by_cause jsonb := '{}'::jsonb; v_mapped int := 0; v_label text; v_exact_other boolean; v_alias_other boolean; v_inactive boolean; v_otherlvl boolean; v_sim boolean; v_sim_allowed boolean;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'Размер страницы от 1 до 500' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = p_job;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Сопоставление доступно только для импорта сотрудников' using errcode = 'P0015'; end if;
  if j.status not in ('STAGED', 'COMMITTED') then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  -- справочник один раз: нормализованные названия, признак записи-пути, токены для «похоже» и закреплённые написания (раньше считались заново для каждого значения)
  select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'level', u.level::text, 'name', u.name, 'parent_id', u.parent_id, 'is_active', u.is_active,
           'pname', p.name, 'nn', norm_name(u.name), 'is_path', org_is_path_record(u.name), 'pfx', to_jsonb(import_orgmap_pfx(norm_name(u.name))),
           'tail', case when u.level = 'DEPARTMENT' and org_is_path_record(u.name) then norm_name((regexp_match(u.name, ' → ([^→]*)$'))[1]) end,
           'aliases', coalesce((select jsonb_agg(a.alias_norm) from org_unit_aliases a where a.org_unit_id = u.id), '[]'::jsonb))), '[]'::jsonb)
    into v_units from org_units u left join org_units p on p.id = u.parent_id;
  for g in
    with el as (select id, row_no, messages, data from import_job_rows
                 where job_id = p_job and status = 'NEEDS_REVIEW' and decision is null and applied_id is null
                   and apply_action is distinct from 'CREATED' and apply_action is distinct from 'UPDATED'),
         pr as (select el.id, el.row_no, p.kind, p.name, p.scope from el cross join lateral import_orgmap_parse(el.messages, el.data) p)
    select kind, scope, norm_name(name) as src_norm, min(name) as src_name, count(distinct id) as nrows, (array_agg(row_no order by row_no))[1:3] as samples, (array_agg(id order by row_no))[1] as first_id
      from pr group by kind, scope, norm_name(name) order by count(distinct id) desc, norm_name(name), scope
  loop
    v_n := v_n + 1;
    v_sd := case when g.kind = 'UNIT' then import_orgmap_scope_dept(p_job, g.scope) end;
    v_ids := import_orgmap_resolve(p_job, g.kind, g.src_name, g.scope);
    select mp.id into v_map from import_org_mappings mp
     where mp.job_id = p_job and mp.kind = g.kind::org_level and mp.src_norm = g.src_norm
       and (mp.scope = g.scope or (v_sd is not null and import_orgmap_scope_dept(p_job, mp.scope) = v_sd)) limit 1;
    v_exact_other := false; v_alias_other := false; v_inactive := false; v_otherlvl := false; v_sim := false; v_sim_allowed := false;
    v_cands := '[]'::jsonb;
    v_label := case when g.scope like 'D:%' then substr(g.scope, 3) when g.scope like 'P:%' then (select name || case when org_is_path_record(name) then ' — запись-путь, а не департамент' else '' end from org_units where id = substr(g.scope, 3)::bigint) else '' end;
    -- кандидаты: точное название, закреплённое написание, похожее; ещё неактивные и другой уровень (для понимания причины)
    v_pfx := import_orgmap_pfx(g.src_norm);
    for c in
      select * from (
        select u.id, u.level, u.name, u.parent_id, u.is_active, u.pname, u.is_path,
               case when u.is_path then 'PATH'
                    when u.nn = g.src_norm then 'EXACT'
                    when g.src_norm = any (select jsonb_array_elements_text(u.aliases)) then 'ALIAS'
                    else 'SIMILAR' end as ck
          from jsonb_to_recordset(v_units) as u(id bigint, level text, name text, parent_id bigint, is_active boolean, pname text, nn text, is_path boolean, pfx text[], tail text, aliases jsonb)
         where (u.nn = g.src_norm
                or g.src_norm = any (select jsonb_array_elements_text(u.aliases))
                -- запись-путь «Родитель → Потомок», хвост которой совпадает со значением из файла: подтверждает, что значение есть в справочнике только как путь
                or (u.level = 'DEPARTMENT' and u.is_path and u.tail = g.src_norm)
                or (u.level = g.kind and not u.is_path and import_orgmap_similar_fast(g.src_norm, u.nn, v_pfx, u.pfx)))
      ) x
       order by case x.ck when 'EXACT' then 1 when 'ALIAS' then 2 when 'PATH' then 3 else 4 end,
                (x.level <> g.kind), (not x.is_active), x.name
       limit 8
    loop
      v_allowed := not c.is_path and c.is_active and c.level = g.kind and (g.kind = 'DEPARTMENT' or g.scope = '' or (v_sd is not null and c.parent_id = v_sd));
      v_why := case when c.is_path then 'Запись-путь «родитель → потомок», а не подразделение'
                    when not c.is_active then 'Неактивно — восстановите в справочнике'
                    when c.level <> g.kind then 'Другой уровень (' || case c.level when 'DEPARTMENT' then 'департамент' else 'отдел' end || ')'
                    when g.kind = 'UNIT' and g.scope <> '' and v_sd is null then 'Сначала сопоставьте департамент'
                    when g.kind = 'UNIT' and g.scope <> '' and c.parent_id is distinct from v_sd then 'Относится к другому департаменту' end;
      if c.is_path then null;
      elsif c.ck in ('EXACT', 'ALIAS') then
        if c.level <> g.kind then v_otherlvl := true;
        elsif not c.is_active then v_inactive := true;
        elsif c.ck = 'EXACT' then v_exact_other := true;
        else v_alias_other := true; end if;
      elsif c.level = g.kind and c.is_active then v_sim := true; if v_allowed then v_sim_allowed := true; end if; end if;
      v_cands := v_cands || jsonb_build_array(jsonb_build_object('id', c.id, 'level', c.level, 'name', c.name, 'parent_id', c.parent_id,
                   'path', coalesce(c.pname || ' › ', '') || c.name, 'kind', case when c.is_path then 'PATH_RECORD' when c.level <> g.kind and c.ck <> 'SIMILAR' then 'OTHER_LEVEL' when not c.is_active then 'INACTIVE' else c.ck end,
                   'allowed', v_allowed, 'why', v_why));
    end loop;
    if coalesce(array_length(v_ids, 1), 0) = 1 then v_cause := case when v_map is not null then 'MAPPED' else 'RESOLVABLE' end;
    elsif coalesce(array_length(v_ids, 1), 0) > 1 then v_cause := 'AMBIGUOUS';
    elsif g.kind = 'UNIT' and g.scope <> '' and v_sd is null then v_cause := 'PARENT_UNRESOLVED';
    elsif v_exact_other then v_cause := 'OTHER_PARENT';
    elsif v_alias_other then v_cause := 'ALIAS_OTHER_PARENT';
    elsif v_inactive then v_cause := 'INACTIVE';
    elsif v_otherlvl then v_cause := 'OTHER_LEVEL';
    elsif v_sim then v_cause := 'SIMILAR';
    else v_cause := 'MISSING'; end if;
    v_action := case v_cause when 'RESOLVABLE' then 'REANALYZE' when 'MAPPED' then 'REANALYZE' when 'PARENT_UNRESOLVED' then 'DEPT_FIRST'
                  when 'MISSING' then case when g.kind = 'DEPARTMENT' or v_sd is not null then 'CREATE' else 'DECIDE' end
                  when 'SIMILAR' then case when g.kind = 'UNIT' and v_sd is not null and not v_sim_allowed then 'CREATE' else 'DECIDE' end else 'DECIDE' end;
    if v_cause = 'MAPPED' then v_mapped := v_mapped + 1; end if;
    v_by_cause := jsonb_set(v_by_cause, array[v_cause], jsonb_build_object(
      'groups', coalesce((v_by_cause->v_cause->>'groups')::int, 0) + 1, 'rows', coalesce((v_by_cause->v_cause->>'rows')::int, 0) + g.nrows));
    if v_n > coalesce(p_offset, 0) and v_n <= coalesce(p_offset, 0) + p_limit then
      v_page := v_page || jsonb_build_array(jsonb_build_object('kind', g.kind, 'src_name', g.src_name, 'src_norm', g.src_norm, 'scope', g.scope, 'scope_label', v_label,
        'rows', g.nrows, 'sample_rows', to_jsonb(g.samples),
        'src_path', case when g.kind = 'UNIT' then (select kv.value from jsonb_each_text((select raw from import_job_rows where id = g.first_id and jsonb_typeof(raw) = 'object')) kv
                      where kv.value like '%/%' and norm_name(trim((regexp_match(kv.value, '([^/]*)$'))[1])) = g.src_norm limit 1) end, 'cause', v_cause, 'action', v_action, 'mapped_to', (select to_jsonb(x) from (
            select u.id, coalesce(p.name || ' › ', '') || u.name as path from import_org_mappings mp join org_units u on u.id = mp.org_unit_id left join org_units p on p.id = u.parent_id where mp.id = v_map) x),
        'resolved_to', case when coalesce(array_length(v_ids, 1), 0) = 1 then (select jsonb_build_object('id', u.id, 'path', coalesce(p.name || ' › ', '') || u.name) from org_units u left join org_units p on p.id = u.parent_id where u.id = v_ids[1]) end,
        'candidates', v_cands));
    end if;
  end loop;
  return jsonb_build_object(
    'job_status', j.status, 'groups', v_n, 'mapped_groups', v_mapped, 'saved_mappings', (select count(*) from import_org_mappings where job_id = p_job),
    'mappings', coalesce((select jsonb_agg(jsonb_build_object('kind', mp.kind, 'src_name', mp.src_name, 'scope', mp.scope,
          'scope_label', case when mp.scope like 'D:%' then substr(mp.scope, 3) when mp.scope like 'P:%' then (select name from org_units where id = substr(mp.scope, 3)::bigint) else '' end,
          'org_unit_id', u.id, 'path', coalesce(p.name || ' › ', '') || u.name,
          'invalid', case when org_is_path_record(u.name) then 'Запись-путь «родитель → потомок», а не подразделение' when not u.is_active then 'Подразделение неактивно' when u.level <> mp.kind then 'Другой уровень' end,
          'open_rows', (select count(*) from import_job_rows jr where jr.job_id = p_job and jr.status = 'NEEDS_REVIEW' and jr.decision is null and jr.applied_id is null
                          and jr.apply_action is distinct from 'CREATED' and jr.apply_action is distinct from 'UPDATED'
                          and (jr.data->>(case when mp.kind = 'DEPARTMENT' then 'department_id' else 'unit_id' end)) = u.id::text)) order by mp.id)
        from import_org_mappings mp join org_units u on u.id = mp.org_unit_id left join org_units p on p.id = u.parent_id where mp.job_id = p_job), '[]'::jsonb), 'by_cause', v_by_cause, 'offset', coalesce(p_offset, 0), 'limit', p_limit,
    'rows_with_unit_issue', (select count(*) from import_job_rows jr where jr.job_id = p_job and jr.status = 'NEEDS_REVIEW' and jr.decision is null and jr.applied_id is null
        and jr.apply_action is distinct from 'CREATED' and jr.apply_action is distinct from 'UPDATED' and exists (select 1 from import_orgmap_parse(jr.messages, jr.data))),
    'review_breakdown', coalesce((select jsonb_agg(jsonb_build_object('code', t.code, 'rows', t.n, 'with_unit_issue', t.w) order by t.n desc)
        from (select coalesce(jr.review_code, '—') as code, count(*) as n, count(*) filter (where exists (select 1 from import_orgmap_parse(jr.messages, jr.data))) as w
                from import_job_rows jr where jr.job_id = p_job and jr.status = 'NEEDS_REVIEW' and jr.decision is null group by 1) t), '[]'::jsonb),
    'duplicates', (select count(*) from import_job_rows where job_id = p_job and status = 'DUPLICATE'),
    'protected', jsonb_build_object(
        'applied', (select count(*) from import_job_rows where job_id = p_job and apply_action in ('CREATED', 'UPDATED')),
        'skipped_by_decision', (select count(*) from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW' and decision is not null)),
    'groups_list', v_page);
end $$;

do $$ declare f text; begin
  foreach f in array array['import_orgmap_pfx(text)', 'import_orgmap_similar_fast(text, text, text[], text[])', 'import_orgmap_row_counts(uuid)',
      'import_orgmap_scan(uuid, integer, integer)', 'import_orgmap_apply(uuid, jsonb, boolean, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
