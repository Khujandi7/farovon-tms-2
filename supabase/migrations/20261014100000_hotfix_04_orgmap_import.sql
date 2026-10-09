-- HOTFIX · M27 — массовое сопоставление оргструктуры в уже загруженном импорте сотрудников.
--
-- Корневая причина (доказана разбором import_analyze_row / import_reanalyze_row / import_reanalyze_job, см. docs/DECISIONS.md D19):
--  1. Повторный разбор (M24–M26) обрабатывает ТОЛЬКО строки с review_code = 'UNIT_UNKNOWN'. Если у строки есть и замечание по сотруднику
--     (EMPLOYEE_*), кодом остаётся оно (приоритет в import_analyze_row), а сообщения «Отдел … не найден» остаются навсегда.
--  2. Отдел ищется строго внутри департамента строки (find_org_units(…, 'UNIT', v_dept)). Если отдел есть в справочнике, но под другим
--     родителем, чем в файле, строка вечно «не найден», хотя «такой отдел уже есть» (массовая вставка 244 путей даёт «дубликаты»).
--  3. Если департамент строки не найден, отдел ищется среди ВСЕХ департаментов: единственное совпадение молча привязывало отдел к чужому
--     департаменту (import_reanalyze_row пишет department_id := parent_id отдела), несколько — «неоднозначен».
--  4. Псевдоним org_unit_aliases.alias_norm глобально уникален: одно и то же написание отдела из файла нельзя закрепить за разными отделами
--     разных департаментов. Одним «закрепить написание» массовое сопоставление не решается.
--  5. Единицей работы был ряд (перепроверка строки), а не уникальное значение из файла: 2385 строк = сотни одинаковых значений.
--
-- Что делает M27 (только функции + одна таблица; M1–M26 не изменены, import_reanalyze_row/import_apply_resolved_batch не переопределяются):
--  • import_org_mappings — сопоставление в рамках ОДНОГО задания: (вид, значение из файла, контекст родителя) → подразделение справочника.
--    Не влияет на другие импорты и не требует глобального псевдонима. Целостность проверяет триггер (отдел не привязывается к чужому департаменту).
--  • import_orgmap_scan(job) — группы по уникальным значениям: кандидаты с полными путями, причина, рекомендация, счётчики по причинам.
--  • import_orgmap_apply(job, items, dry, reason) — сопоставить / закрепить псевдоним / создать / снять сопоставление; dry = предпросмотр
--    тем же кодом (изменения откатываются), без предпросмотра нужна причина.
--  • import_orgmap_reanalyze_batch(job, limit, after) — пакетный повторный разбор ВСЕХ нерешённых строк с замечанием по подразделению
--    (любой review_code), с учётом сопоставления задания, псевдонимов и созданных подразделений; сотрудников не создаёт.
-- Применение разрешённых строк — прежняя import_apply_resolved_batch (M26): повторное сопоставление сотрудника перед записью, идемпотентность.
-- Применённые строки (apply_action CREATED/UPDATED, applied_id), строки с решением пользователя (decision) и processed_at не затрагиваются.

-- ---------- 1. Таблица сопоставлений задания ----------
create table import_org_mappings (
  id bigint generated always as identity primary key,
  job_id uuid not null references import_jobs(id) on delete cascade,
  kind org_level not null,
  src_name text not null check (length(trim(src_name)) between 1 and 300),
  src_norm text not null check (src_norm <> ''),
  scope text not null default '' check (scope = '' or scope ~ '^(D:.+|P:[0-9]+)$'),
  org_unit_id bigint not null references org_units(id),
  reason text not null check (length(trim(reason)) > 0),
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  unique (job_id, kind, src_norm, scope)
);
create index import_org_mappings_unit_idx on import_org_mappings (org_unit_id);
create index import_org_mappings_creator_idx on import_org_mappings (created_by);
alter table import_org_mappings enable row level security;
create policy import_org_mappings_read on import_org_mappings for select to authenticated
  using (exists (select 1 from import_jobs j where j.id = job_id and can_import(j.entity)));
create policy import_org_mappings_write on import_org_mappings for all to authenticated
  using (exists (select 1 from import_jobs j where j.id = job_id and can_import(j.entity)))
  with check (exists (select 1 from import_jobs j where j.id = job_id and can_import(j.entity)));
grant select, insert, update, delete on import_org_mappings to authenticated;
revoke all on import_org_mappings from anon;
create trigger audit_import_org_mappings after insert or update or delete on import_org_mappings for each row execute function trg_audit();

-- ---------- 2. Разбор сообщений строки: что именно не найдено и в каком контексте ----------
-- scope отдела: 'D:<норм. название департамента из файла>' (пока департамент не найден), 'P:<id департамента>' (найден), '' (в файле только отдел).
create function import_orgmap_parse(p_messages text[], p_data jsonb) returns table(kind text, name text, scope text)
language sql immutable set search_path = public, pg_temp as $$
  select 'DEPARTMENT'::text, (regexp_match(m, '^Подразделение «(.*)» (?:не найдено|неоднозначно)$'))[1], ''::text
    from unnest(p_messages) m where m ~ '^Подразделение «.*» (?:не найдено|неоднозначно)$'
  union all
  select 'UNIT'::text, (regexp_match(m, '^Отдел «(.*)» (?:не найден|неоднозначен)$'))[1],
         coalesce((select 'D:' || norm_name((regexp_match(x, '^Подразделение «(.*)» (?:не найдено|неоднозначно)$'))[1])
                     from unnest(p_messages) x where x ~ '^Подразделение «.*» (?:не найдено|неоднозначно)$' limit 1),
                  case when nullif(p_data->>'department_id', '') is not null then 'P:' || (p_data->>'department_id') end, '')
    from unnest(p_messages) m where m ~ '^Отдел «.*» (?:не найден|неоднозначен)$'
$$;

-- ---------- 3. Контекст и поиск с учётом сопоставления задания ----------
create function import_orgmap_scope_dept(p_job uuid, p_scope text) returns bigint
language plpgsql stable set search_path = public, pg_temp as $$
declare v_ids bigint[];
begin
  if p_scope ~ '^P:[0-9]+$' then return substr(p_scope, 3)::bigint; end if;
  if p_scope like 'D:%' then
    v_ids := import_orgmap_resolve(p_job, 'DEPARTMENT', substr(p_scope, 3), '');
    if array_length(v_ids, 1) = 1 then return v_ids[1]; end if;
  end if;
  return null;
end $$;

-- Подразделения, подходящие под значение из файла: сначала сопоставление задания, затем обычный поиск (название/псевдоним, только действующие).
-- Отдел при НЕНАЙДЕННОМ департаменте файла не ищется и к чужому департаменту не привязывается.
create function import_orgmap_resolve(p_job uuid, p_kind text, p_name text, p_scope text) returns bigint[]
language plpgsql stable set search_path = public, pg_temp as $$
declare v_norm text := norm_name(p_name); v_id bigint; v_want bigint; m record;
begin
  if p_kind = 'DEPARTMENT' then
    select mp.org_unit_id into v_id from import_org_mappings mp join org_units u on u.id = mp.org_unit_id
     where mp.job_id = p_job and mp.kind = 'DEPARTMENT' and mp.src_norm = v_norm and u.is_active and u.level = 'DEPARTMENT';
    if found then return array[v_id]; end if;
    return find_org_units(p_name, 'DEPARTMENT');
  end if;
  v_want := import_orgmap_scope_dept(p_job, p_scope);
  if p_scope like 'D:%' and v_want is null then return '{}'; end if;
  for m in select mp.org_unit_id, mp.scope, u.parent_id from import_org_mappings mp join org_units u on u.id = mp.org_unit_id
            where mp.job_id = p_job and mp.kind = 'UNIT' and mp.src_norm = v_norm and u.is_active and u.level = 'UNIT' order by mp.id loop
    if (m.scope = p_scope or (v_want is not null and import_orgmap_scope_dept(p_job, m.scope) = v_want))
       and (v_want is null or m.parent_id = v_want) then
      return array[m.org_unit_id];
    end if;
  end loop;
  return find_org_units(p_name, 'UNIT', v_want);
end $$;

-- Допустимость цели для значения: отдел не может быть привязан к чужому департаменту.
create function import_orgmap_check_target(p_job uuid, p_kind org_level, p_scope text, p_target bigint) returns void
language plpgsql stable set search_path = public, pg_temp as $$
declare u org_units%rowtype; v_dept bigint;
begin
  select * into u from org_units where id = p_target;
  if not found then raise exception 'Подразделение не найдено' using errcode = 'P0015'; end if;
  if not u.is_active then raise exception 'Подразделение «%» неактивно: сначала восстановите его в справочнике', u.name using errcode = 'P0015'; end if;
  if u.level <> p_kind then raise exception 'Уровень подразделения «%» не совпадает (нужен %)', u.name, case p_kind when 'DEPARTMENT' then 'департамент' else 'отдел' end using errcode = 'P0015'; end if;
  if p_kind = 'DEPARTMENT' then return; end if;
  if p_scope = '' then return; end if;
  v_dept := import_orgmap_scope_dept(p_job, p_scope);
  if v_dept is null then raise exception 'Сначала сопоставьте департамент из файла' using errcode = 'P0015'; end if;
  if u.parent_id is distinct from v_dept then raise exception 'Отдел «%» относится к другому департаменту — он не будет привязан к чужому', u.name using errcode = 'P0015'; end if;
end $$;

create function trg_import_org_mappings_check() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype;
begin
  select * into j from import_jobs where id = new.job_id;
  if not found or j.entity <> 'EMPLOYEES' or not can_import(j.entity) then raise exception 'Импорт не найден или недостаточно прав' using errcode = '42501'; end if;
  if j.status not in ('STAGED', 'COMMITTED') then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  if new.src_norm <> norm_name(new.src_name) then raise exception 'Значение из файла не совпадает с нормализованным' using errcode = 'P0015'; end if;
  if new.kind = 'DEPARTMENT' and new.scope <> '' then raise exception 'У департамента нет контекста родителя' using errcode = 'P0015'; end if;
  perform import_orgmap_check_target(new.job_id, new.kind, new.scope, new.org_unit_id);
  new.updated_at := now();
  return new;
end $$;
create trigger import_org_mappings_check before insert or update on import_org_mappings for each row execute function trg_import_org_mappings_check();

-- Похожие названия — только как подсказка кандидатов (никогда не объединяются автоматически): одно содержит другое, либо совпадает значимое
-- слово по первым 4 буквам («кадры» ~ «кадров»); общие слова («отдел», «управление», …) не считаются.
create function import_orgmap_similar(a text, b text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select (length(a) >= 4 and length(b) >= 4 and (position(a in b) > 0 or position(b in a) > 0))
      or exists (select 1 from unnest(string_to_array(a, ' ')) x, unnest(string_to_array(b, ' ')) y
                  where length(x) >= 4 and length(y) >= 4 and left(x, 4) = left(y, 4)
                    and x <> all (array['отдел','отделение','управление','департамент','участок','служба','группа','сектор','бюро','центр','подразделение'])
                    and y <> all (array['отдел','отделение','управление','департамент','участок','служба','группа','сектор','бюро','центр','подразделение']))
$$;

-- ---------- 4. Скан: уникальные значения, кандидаты, причина, рекомендация ----------
-- Причины: RESOLVABLE (теперь находится — нужен повторный разбор), MAPPED (есть сопоставление), AMBIGUOUS, PARENT_UNRESOLVED (сначала департамент),
-- OTHER_PARENT (такой отдел есть, но у другого департамента), ALIAS_OTHER_PARENT (написание закреплено за подразделением другого департамента),
-- INACTIVE, OTHER_LEVEL, SIMILAR (только похожие), MISSING (нигде нет).
create function import_orgmap_scan(p_job uuid, p_limit integer default 300, p_offset integer default 0) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; g record; v_page jsonb := '[]'::jsonb; v_cands jsonb; c record; v_ids bigint[]; v_sd bigint; v_cause text; v_action text; v_n int := 0; v_map bigint;
        v_allowed boolean; v_why text; v_by_cause jsonb := '{}'::jsonb; v_mapped int := 0; v_label text; v_exact_other boolean; v_alias_other boolean; v_inactive boolean; v_otherlvl boolean; v_sim boolean;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'Размер страницы от 1 до 500' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = p_job;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Сопоставление доступно только для импорта сотрудников' using errcode = 'P0015'; end if;
  if j.status not in ('STAGED', 'COMMITTED') then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  for g in
    with el as (select id, row_no, messages, data from import_job_rows
                 where job_id = p_job and status = 'NEEDS_REVIEW' and decision is null and applied_id is null
                   and apply_action is distinct from 'CREATED' and apply_action is distinct from 'UPDATED'),
         pr as (select el.id, el.row_no, p.kind, p.name, p.scope from el cross join lateral import_orgmap_parse(el.messages, el.data) p)
    select kind, scope, norm_name(name) as src_norm, min(name) as src_name, count(distinct id) as nrows, (array_agg(row_no order by row_no))[1:3] as samples
      from pr group by kind, scope, norm_name(name) order by count(distinct id) desc, norm_name(name), scope
  loop
    v_n := v_n + 1;
    v_sd := case when g.kind = 'UNIT' then import_orgmap_scope_dept(p_job, g.scope) end;
    v_ids := import_orgmap_resolve(p_job, g.kind, g.src_name, g.scope);
    select mp.id into v_map from import_org_mappings mp
     where mp.job_id = p_job and mp.kind = g.kind::org_level and mp.src_norm = g.src_norm
       and (mp.scope = g.scope or (v_sd is not null and import_orgmap_scope_dept(p_job, mp.scope) = v_sd)) limit 1;
    v_exact_other := false; v_alias_other := false; v_inactive := false; v_otherlvl := false; v_sim := false;
    v_cands := '[]'::jsonb;
    v_label := case when g.scope like 'D:%' then substr(g.scope, 3) when g.scope like 'P:%' then (select name from org_units where id = substr(g.scope, 3)::bigint) else '' end;
    -- кандидаты: точное название, закреплённое написание, похожее; ещё неактивные и другой уровень (для понимания причины)
    for c in
      select u.id, u.level::text as level, u.name, u.parent_id, u.is_active, p.name as pname,
             case when norm_name(u.name) = g.src_norm then 'EXACT'
                  when exists (select 1 from org_unit_aliases a where a.org_unit_id = u.id and a.alias_norm = g.src_norm) then 'ALIAS'
                  else 'SIMILAR' end as ck
        from org_units u left join org_units p on p.id = u.parent_id
       where (norm_name(u.name) = g.src_norm
              or exists (select 1 from org_unit_aliases a where a.org_unit_id = u.id and a.alias_norm = g.src_norm)
              or (u.level::text = g.kind and import_orgmap_similar(g.src_norm, norm_name(u.name))))
       order by case when norm_name(u.name) = g.src_norm then 1 when exists (select 1 from org_unit_aliases a where a.org_unit_id = u.id and a.alias_norm = g.src_norm) then 2 else 3 end,
                (u.level::text <> g.kind), (not u.is_active), u.name
       limit 8
    loop
      v_allowed := c.is_active and c.level = g.kind and (g.kind = 'DEPARTMENT' or g.scope = '' or (v_sd is not null and c.parent_id = v_sd));
      v_why := case when not c.is_active then 'Неактивно — восстановите в справочнике'
                    when c.level <> g.kind then 'Другой уровень (' || case c.level when 'DEPARTMENT' then 'департамент' else 'отдел' end || ')'
                    when g.kind = 'UNIT' and g.scope <> '' and v_sd is null then 'Сначала сопоставьте департамент'
                    when g.kind = 'UNIT' and g.scope <> '' and c.parent_id is distinct from v_sd then 'Относится к другому департаменту' end;
      if c.ck in ('EXACT', 'ALIAS') then
        if c.level <> g.kind then v_otherlvl := true;
        elsif not c.is_active then v_inactive := true;
        elsif c.ck = 'EXACT' then v_exact_other := true;
        else v_alias_other := true; end if;
      elsif c.level = g.kind and c.is_active then v_sim := true; end if;
      v_cands := v_cands || jsonb_build_array(jsonb_build_object('id', c.id, 'level', c.level, 'name', c.name, 'parent_id', c.parent_id,
                   'path', coalesce(c.pname || ' › ', '') || c.name, 'kind', case when c.level <> g.kind and c.ck <> 'SIMILAR' then 'OTHER_LEVEL' when not c.is_active then 'INACTIVE' else c.ck end,
                   'allowed', v_allowed, 'why', v_why));
    end loop;
    if coalesce(array_length(v_ids, 1), 0) = 1 then v_cause := case when v_map is not null then 'MAPPED' else 'RESOLVABLE' end;
    elsif coalesce(array_length(v_ids, 1), 0) > 1 then v_cause := 'AMBIGUOUS';
    elsif g.kind = 'UNIT' and g.scope like 'D:%' and v_sd is null then v_cause := 'PARENT_UNRESOLVED';
    elsif v_exact_other then v_cause := 'OTHER_PARENT';
    elsif v_alias_other then v_cause := 'ALIAS_OTHER_PARENT';
    elsif v_inactive then v_cause := 'INACTIVE';
    elsif v_otherlvl then v_cause := 'OTHER_LEVEL';
    elsif v_sim then v_cause := 'SIMILAR';
    else v_cause := 'MISSING'; end if;
    v_action := case v_cause when 'RESOLVABLE' then 'REANALYZE' when 'MAPPED' then 'REANALYZE' when 'PARENT_UNRESOLVED' then 'DEPT_FIRST'
                  when 'MISSING' then case when g.kind = 'DEPARTMENT' or v_sd is not null then 'CREATE' else 'DECIDE' end else 'DECIDE' end;
    if v_cause = 'MAPPED' then v_mapped := v_mapped + 1; end if;
    v_by_cause := jsonb_set(v_by_cause, array[v_cause], jsonb_build_object(
      'groups', coalesce((v_by_cause->v_cause->>'groups')::int, 0) + 1, 'rows', coalesce((v_by_cause->v_cause->>'rows')::int, 0) + g.nrows));
    if v_n > coalesce(p_offset, 0) and v_n <= coalesce(p_offset, 0) + p_limit then
      v_page := v_page || jsonb_build_array(jsonb_build_object('kind', g.kind, 'src_name', g.src_name, 'src_norm', g.src_norm, 'scope', g.scope, 'scope_label', v_label,
        'rows', g.nrows, 'sample_rows', to_jsonb(g.samples), 'cause', v_cause, 'action', v_action, 'mapped_to', (select to_jsonb(x) from (
            select u.id, coalesce(p.name || ' › ', '') || u.name as path from import_org_mappings mp join org_units u on u.id = mp.org_unit_id left join org_units p on p.id = u.parent_id where mp.id = v_map) x),
        'resolved_to', case when coalesce(array_length(v_ids, 1), 0) = 1 then (select jsonb_build_object('id', u.id, 'path', coalesce(p.name || ' › ', '') || u.name) from org_units u left join org_units p on p.id = u.parent_id where u.id = v_ids[1]) end,
        'candidates', v_cands));
    end if;
  end loop;
  return jsonb_build_object(
    'job_status', j.status, 'groups', v_n, 'mapped_groups', v_mapped, 'by_cause', v_by_cause, 'offset', coalesce(p_offset, 0), 'limit', p_limit,
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

-- ---------- 5. Применение сопоставления (и предпросмотр тем же кодом) ----------
-- items: [{kind, src_name, scope, action: MAP|ALIAS|CREATE|CLEAR, org_unit_id?, name?, confirm_homonym?}], до 200 за вызов.
-- Департаменты обрабатываются раньше отделов (контекст отдела зависит от сопоставления департамента). Каждый пункт — отдельная подтранзакция:
-- ошибка пункта не откатывает остальные. p_dry = true: всё выполняется и откатывается (счётчики и ошибки те же, что при сохранении).
create function import_orgmap_apply(p_job uuid, p_items jsonb, p_dry boolean default true, p_reason text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; it record; v_reason text; v_out jsonb := '[]'::jsonb; e jsonb; k org_level; v_name text; v_norm text; v_scope text; v_act text; v_target bigint;
        v_rows int; v_changed boolean; v_alias_added boolean; v_created bigint; v_sd bigint; v_parent bigint; v_prev bigint; v_cnt_ok int := 0; v_cnt_fail int := 0;
        v_map int := 0; v_alias int := 0; v_create int := 0; v_clear int := 0; v_rows_total int := 0; v_cname text;
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
        select count(distinct jr.id) into v_rows from import_job_rows jr cross join lateral import_orgmap_parse(jr.messages, jr.data) p
         where jr.job_id = p_job and jr.status = 'NEEDS_REVIEW' and jr.decision is null and jr.applied_id is null
           and jr.apply_action is distinct from 'CREATED' and jr.apply_action is distinct from 'UPDATED'
           and p.kind = k::text and norm_name(p.name) = v_norm and p.scope = v_scope;
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
          delete from import_org_mappings where job_id = p_job and kind = k and src_norm = v_norm and scope = v_scope;
          v_changed := found; v_clear := v_clear + 1;
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

-- ---------- 6. Пакетный повторный разбор подразделений (любой review_code) ----------
create function import_orgmap_reanalyze_batch(p_job uuid, p_limit integer default 200, p_after bigint default 0) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; r record; p record; d jsonb; ids bigint[]; v_dept bigint; v_unit bigint; v_dn text; v_dept_open boolean; v_unit_open boolean; v_open_units text[];
        new_msgs text[]; m text; nm text; v_ok text := 'Подразделение найдено в справочнике'; new_status text; v_unit_row bigint;
        v_proc int := 0; v_res int := 0; v_still int := 0; v_err int := 0; v_last bigint := coalesce(p_after, 0); v_first_err text; v_remaining int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'Размер пакета от 1 до 500' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = p_job for update;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Сопоставление доступно только для импорта сотрудников' using errcode = 'P0015'; end if;
  if j.status not in ('STAGED', 'COMMITTED') then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', 'Повторная проверка подразделений импорта: ' || left(j.file_name, 150), true);
  for r in select id, row_no, messages, data, review_code, match_id from import_job_rows
            where job_id = p_job and status = 'NEEDS_REVIEW' and decision is null and applied_id is null
              and apply_action is distinct from 'CREATED' and apply_action is distinct from 'UPDATED'
              and id > coalesce(p_after, 0) and exists (select 1 from unnest(messages) x where x ~ '^(?:Подразделение|Отдел) «')
            order by id limit p_limit loop
    v_last := r.id; v_proc := v_proc + 1;
    begin
      d := r.data; v_dept := null; v_unit := null; v_dept_open := false; v_unit_open := false; v_open_units := '{}'; new_msgs := '{}';
      select name into v_dn from import_orgmap_parse(r.messages, r.data) where kind = 'DEPARTMENT' limit 1;
      if v_dn is not null then
        ids := import_orgmap_resolve(p_job, 'DEPARTMENT', v_dn, '');
        if coalesce(array_length(ids, 1), 0) = 1 then v_dept := ids[1]; else v_dept_open := true; end if;
      else v_dept := nullif(d->>'department_id', '')::bigint; end if;
      for p in select kind, name, scope from import_orgmap_parse(r.messages, r.data) where kind = 'UNIT' loop
        if v_dept_open then v_unit_open := true; v_open_units := v_open_units || norm_name(p.name); continue; end if;
        ids := import_orgmap_resolve(p_job, 'UNIT', p.name, p.scope);
        if coalesce(array_length(ids, 1), 0) = 1 then
          v_unit := ids[1];
          if v_dept is null then select parent_id into v_dept from org_units where id = v_unit; end if;
        else v_unit_open := true; v_open_units := v_open_units || norm_name(p.name); end if;
      end loop;
      foreach m in array r.messages loop
        if m ~ '^Подразделение «.*» (?:не найдено|неоднозначно)$' then
          if v_dept_open then new_msgs := new_msgs || m; end if;
        elsif m ~ '^Отдел «.*» (?:не найден|неоднозначен)$' then
          nm := (regexp_match(m, '^Отдел «(.*)» (?:не найден|неоднозначен)$'))[1];
          if norm_name(nm) = any (v_open_units) then new_msgs := new_msgs || m; end if;
        elsif m <> v_ok then new_msgs := new_msgs || m; end if;
      end loop;
      if v_dept_open then d := d - 'department_id'; elsif v_dept is not null then d := d || jsonb_build_object('department_id', v_dept); end if;
      if v_unit_open then d := d - 'unit_id'; elsif v_unit is not null then d := d || jsonb_build_object('unit_id', v_unit); end if;
      if not v_dept_open and not v_unit_open then
        if r.review_code = 'UNIT_UNKNOWN' then
          new_msgs := new_msgs || v_ok;
          new_status := case when r.match_id is not null then 'UPDATED' else 'NEW' end;
          update import_job_rows set data = d, status = new_status, review_code = null, messages = new_msgs where id = r.id;
          perform import_dq_sync(p_job, r.id, null, null, false);
        else   -- решение по сотруднику всё ещё нужно: подразделение разобрано, строка остаётся на проверке
          update import_job_rows set data = d, messages = new_msgs where id = r.id;
        end if;
        v_res := v_res + 1;
      else
        update import_job_rows set data = d, messages = new_msgs where id = r.id;
        if r.review_code = 'UNIT_UNKNOWN' then
          perform import_dq_sync(p_job, r.id, 'UNIT_UNKNOWN', 'Импорт «' || j.file_name || '», строка ' || r.row_no || ': ' || coalesce(new_msgs[1], 'подразделение не найдено'), true);
        end if;
        v_still := v_still + 1;
      end if;
    exception
      when query_canceled or lock_not_available or deadlock_detected then raise;
      when others then v_err := v_err + 1; v_first_err := coalesce(v_first_err, sqlerrm);
    end;
  end loop;
  perform import_job_recount(p_job);
  select count(*) into v_remaining from import_job_rows
   where job_id = p_job and status = 'NEEDS_REVIEW' and decision is null and applied_id is null
     and apply_action is distinct from 'CREATED' and apply_action is distinct from 'UPDATED'
     and id > v_last and exists (select 1 from unnest(messages) x where x ~ '^(?:Подразделение|Отдел) «');
  return jsonb_build_object('processed', v_proc, 'resolved', v_res, 'unresolved', v_still, 'errors', v_err, 'first_error', v_first_err,
                            'next_after', v_last, 'remaining', v_remaining, 'done', v_proc < p_limit);
end $$;

do $$ declare f text; begin
  foreach f in array array['import_orgmap_parse(text[], jsonb)', 'import_orgmap_similar(text, text)', 'import_orgmap_scope_dept(uuid, text)', 'import_orgmap_resolve(uuid, text, text, text)',
      'import_orgmap_check_target(uuid, org_level, text, bigint)', 'import_orgmap_scan(uuid, integer, integer)',
      'import_orgmap_apply(uuid, jsonb, boolean, text)', 'import_orgmap_reanalyze_batch(uuid, integer, bigint)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
-- триггерная функция вызывается только триггером: прямого EXECUTE у ролей нет (как у остальных trg_*)
revoke execute on function trg_import_org_mappings_check() from public, anon, authenticated;
