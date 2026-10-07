-- Phase 3A.1 · M15: сотрудники (табельный номер, даты приёма/увольнения, email), сопоставление ФИО, структура подразделений.
-- employees остаются отдельным справочником: участники в сотрудников автоматически не превращаются.

alter table employees
  add column employee_code text,
  add column hire_date date,
  add column termination_date date,
  add constraint employees_dates_ok check (termination_date is null or hire_date is null or termination_date >= hire_date),
  add constraint employees_code_not_blank check (employee_code is null or length(trim(employee_code)) > 0);
create unique index employees_employee_code_key on employees (lower(employee_code)) where employee_code is not null;
create index employees_active_idx on employees (is_active);
create index employees_unit_idx on employees (unit_id);
create index employees_department_idx on employees (department_id);

alter table employee_contacts add column email text;

-- ---------- Сопоставление ФИО ----------
-- Ключ без учёта порядка слов: «Иванов Иван» = «Иван Иванов».
create function name_key(p text) returns text language sql immutable
set search_path = public, pg_temp as $$
  select coalesce(string_agg(w, ' ' order by w), '') from unnest(string_to_array(norm_name(p), ' ')) w where w <> ''
$$;
create index employees_name_key_idx on employees (name_key(name_norm));

-- Кандидаты по одному ФИО/табельному номеру. match_kind: CODE, EXACT, ALIAS, REORDERED, PARTIAL (первое слово + имя).
create function match_employee_candidates(p_name text, p_code text default null, p_active_only boolean default true)
returns table(employee_id uuid, full_name text, match_kind text, department_id bigint, unit_id bigint, "position" text, is_active boolean)
language sql stable set search_path = public, pg_temp as $$
  with q as (select norm_name(p_name) n, name_key(p_name) k, nullif(lower(trim(coalesce(p_code,''))), '') c),
  hits as (
    select e.id, 'CODE' kind, 1 rank from employees e, q where q.c is not null and lower(e.employee_code) = q.c
    union all
    select e.id, 'EXACT', 2 from employees e, q where q.n <> '' and e.name_norm = q.n
    union all
    select a.employee_id, 'ALIAS', 3 from employee_aliases a, q where q.n <> '' and a.alias_norm = q.n
    union all
    select e.id, 'REORDERED', 4 from employees e, q where q.k <> '' and name_key(e.name_norm) = q.k and e.name_norm <> q.n
    union all
    select e.id, 'PARTIAL', 5 from employees e, q
     where q.n <> '' and array_length(string_to_array(q.n, ' '), 1) >= 2
       and e.name_norm like split_part(q.n, ' ', 1) || ' ' || split_part(q.n, ' ', 2) || ' %'
  ),
  best as (select id, min(rank) rank, (array_agg(kind order by rank))[1] kind from hits group by id)
  select e.id, e.full_name, b.kind, e.department_id, e.unit_id, e."position", e.is_active
    from best b join employees e on e.id = b.id
   where (not p_active_only or e.is_active)
   order by b.rank, e.full_name
   limit 20
$$;

-- Пакетное сопоставление списка ФИО (вставка списка, Excel/CSV). Ничего не создаёт и не меняет.
-- status: FOUND (однозначно), AMBIGUOUS (несколько), NOT_FOUND. Для REORDERED/PARTIAL считаем однозначным только единственного кандидата лучшего типа.
create function match_names(p_names text[], p_codes text[] default null) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare r jsonb := '[]'::jsonb; i int; n text; c text; cands jsonb; best text; cnt int;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if coalesce(array_length(p_names, 1), 0) > 3000 then raise exception 'Не больше 3000 строк за раз' using errcode = 'P0015'; end if;
  for i in 1 .. coalesce(array_length(p_names, 1), 0) loop
    n := p_names[i]; c := case when p_codes is null then null else p_codes[i] end;
    if length(trim(coalesce(n,''))) = 0 and length(trim(coalesce(c,''))) = 0 then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('employee_id', employee_id, 'full_name', full_name, 'match_kind', match_kind,
                  'department_id', department_id, 'unit_id', unit_id, 'position', "position")), '[]'::jsonb),
           (array_agg(match_kind order by case match_kind when 'CODE' then 1 when 'EXACT' then 2 when 'ALIAS' then 3 when 'REORDERED' then 4 else 5 end))[1]
      into cands, best from match_employee_candidates(n, c, true);
    select count(*) into cnt from jsonb_array_elements(cands) x where x->>'match_kind' = best;
    r := r || jsonb_build_array(jsonb_build_object('index', i, 'input', n, 'code', c,
           'status', case when jsonb_array_length(cands) = 0 then 'NOT_FOUND' when cnt = 1 then 'FOUND' else 'AMBIGUOUS' end,
           'candidates', cands));
  end loop;
  return r;
end $$;

-- ---------- Сотрудники: поля, контакты, правила ----------
create or replace function create_employee(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_name text := trim(coalesce(p->>'full_name', '')); v_unit bigint := nullif(p->>'unit_id','')::bigint;
        v_dep bigint := nullif(p->>'department_id','')::bigint; v_code text := nullif(trim(coalesce(p->>'employee_code','')), '');
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if v_name = '' then raise exception 'Укажите ФИО' using errcode = 'P0015'; end if;
  if v_unit is not null and v_dep is null then select parent_id into v_dep from org_units where id = v_unit; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создание сотрудника'), true);
  insert into employees(canonical_id, full_name, name_norm, department_id, unit_id, "position", employee_code, hire_date, termination_date, is_active)
  values (next_employee_code(), v_name, norm_name(v_name), v_dep, v_unit, nullif(trim(coalesce(p->>'position','')), ''),
          v_code, nullif(p->>'hire_date','')::date, nullif(p->>'termination_date','')::date,
          not (nullif(p->>'termination_date','')::date is not null and nullif(p->>'termination_date','')::date <= current_date))
  returning id into v_id;
  if nullif(trim(coalesce(p->>'phone','')), '') is not null or nullif(trim(coalesce(p->>'email','')), '') is not null then
    insert into employee_contacts(employee_id, phone, email)
    values (v_id, nullif(trim(coalesce(p->>'phone','')), ''), nullif(trim(coalesce(p->>'email','')), ''));
  end if;
  return v_id;
end $$;

create or replace function update_employee(p_id uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare k text; v_r text; v_term date; v_need boolean;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('full_name','department_id','unit_id','position','is_active','employee_code','hire_date','termination_date','phone','email') then
      raise exception 'Поле «%» нельзя менять', k using errcode = 'P0015'; end if;
  end loop;
  if p_patch ? 'full_name' and length(trim(coalesce(p_patch->>'full_name',''))) = 0 then
    raise exception 'ФИО не может быть пустым' using errcode = 'P0015'; end if;
  v_need := p_patch ? 'is_active' or p_patch ? 'termination_date' or p_patch ? 'employee_code';
  v_r := case when v_need then req_reason(p_reason) else nullif(trim(coalesce(p_reason,'')), '') end;
  perform set_config('app.change_reason', coalesce(v_r, ''), true);
  v_term := case when p_patch ? 'termination_date' then nullif(p_patch->>'termination_date','')::date end;
  update employees set
    full_name = case when p_patch ? 'full_name' then trim(p_patch->>'full_name') else full_name end,
    name_norm = case when p_patch ? 'full_name' then norm_name(p_patch->>'full_name') else name_norm end,
    unit_id = case when p_patch ? 'unit_id' then nullif(p_patch->>'unit_id','')::bigint else unit_id end,
    department_id = case when p_patch ? 'department_id' then nullif(p_patch->>'department_id','')::bigint
                         when p_patch ? 'unit_id' and nullif(p_patch->>'unit_id','') is not null
                           then (select parent_id from org_units where id = (p_patch->>'unit_id')::bigint)
                         else department_id end,
    "position" = case when p_patch ? 'position' then nullif(trim(coalesce(p_patch->>'position','')), '') else "position" end,
    employee_code = case when p_patch ? 'employee_code' then nullif(trim(coalesce(p_patch->>'employee_code','')), '') else employee_code end,
    hire_date = case when p_patch ? 'hire_date' then nullif(p_patch->>'hire_date','')::date else hire_date end,
    termination_date = case when p_patch ? 'termination_date' then v_term else termination_date end,
    is_active = case when p_patch ? 'is_active' then (p_patch->>'is_active')::boolean
                     when p_patch ? 'termination_date' and v_term is not null and v_term <= current_date then false
                     else is_active end,
    updated_at = now()
   where id = p_id;
  if not found then raise exception 'Сотрудник не найден' using errcode = 'P0015'; end if;
  if p_patch ? 'phone' or p_patch ? 'email' then
    insert into employee_contacts(employee_id, phone, email)
    values (p_id, nullif(trim(coalesce(p_patch->>'phone','')), ''), nullif(trim(coalesce(p_patch->>'email','')), ''))
    on conflict (employee_id) do update set
      phone = case when p_patch ? 'phone' then excluded.phone else employee_contacts.phone end,
      email = case when p_patch ? 'email' then excluded.email else employee_contacts.email end;
  end if;
end $$;

-- ---------- Подразделения: структура через идентификаторы ----------
create function create_org_unit(p jsonb, p_reason text default null) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare v_id bigint; v_parent bigint := nullif(p->>'parent_id','')::bigint; v_name text := trim(coalesce(p->>'name',''));
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if length(v_name) < 2 then raise exception 'Введите название подразделения' using errcode = 'P0015'; end if;
  if v_parent is not null and not exists (select 1 from org_units where id = v_parent and level = 'DEPARTMENT' and is_active) then
    raise exception 'Родитель должен быть действующим департаментом' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создание подразделения'), true);
  insert into org_units(parent_id, name, level) values (v_parent, v_name, case when v_parent is null then 'DEPARTMENT'::org_level else 'UNIT'::org_level end)
  returning id into v_id;
  return v_id;
end $$;

create function rename_org_unit(p_id bigint, p_name text, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_old text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Введите название подразделения' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', req_reason(p_reason), true);
  select name into v_old from org_units where id = p_id for update;
  if not found then raise exception 'Подразделение не найдено' using errcode = 'P0015'; end if;
  update org_units set name = trim(p_name) where id = p_id;
  -- прежнее название остаётся как псевдоним: импорт по старому названию продолжит находить подразделение
  insert into org_unit_aliases(org_unit_id, alias_norm) values (p_id, norm_name(v_old)) on conflict do nothing;
end $$;

-- Отдел переезжает в другой департамент: сотрудникам отдела обновляется департамент; снимки участников в прошлых обучениях не меняются.
create function move_org_unit(p_id bigint, p_new_parent bigint, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare u org_units%rowtype;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  select * into u from org_units where id = p_id for update;
  if not found then raise exception 'Подразделение не найдено' using errcode = 'P0015'; end if;
  if u.level <> 'UNIT' then raise exception 'Перемещать можно только отделы (департаменты — верхний уровень)' using errcode = 'P0015'; end if;
  if not exists (select 1 from org_units where id = p_new_parent and level = 'DEPARTMENT' and is_active) then
    raise exception 'Новый родитель должен быть действующим департаментом' using errcode = 'P0015'; end if;
  if p_new_parent = u.parent_id then return; end if;
  update org_units set parent_id = p_new_parent where id = p_id;
  update employees set department_id = p_new_parent, updated_at = now() where unit_id = p_id;
end $$;

-- Деактивация: у департамента не должно оставаться действующих отделов; история и ссылки по id сохраняются.
create function set_org_unit_active(p_id bigint, p_active boolean, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare u org_units%rowtype;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  select * into u from org_units where id = p_id for update;
  if not found then raise exception 'Подразделение не найдено' using errcode = 'P0015'; end if;
  if not p_active and exists (select 1 from org_units where parent_id = p_id and is_active) then
    raise exception 'Сначала деактивируйте или переместите действующие отделы' using errcode = 'P0015'; end if;
  if p_active and u.parent_id is not null and not exists (select 1 from org_units where id = u.parent_id and is_active) then
    raise exception 'Сначала восстановите департамент' using errcode = 'P0015'; end if;
  update org_units set is_active = p_active where id = p_id;
end $$;

revoke execute on function name_key(text), match_employee_candidates(text, text, boolean), match_names(text[], text[]),
  create_org_unit(jsonb, text), rename_org_unit(bigint, text, text), move_org_unit(bigint, bigint, text),
  set_org_unit_active(bigint, boolean, text) from public, anon;
grant execute on function name_key(text), match_employee_candidates(text, text, boolean), match_names(text[], text[]),
  create_org_unit(jsonb, text), rename_org_unit(bigint, text, text), move_org_unit(bigint, bigint, text),
  set_org_unit_active(bigint, boolean, text) to authenticated;
