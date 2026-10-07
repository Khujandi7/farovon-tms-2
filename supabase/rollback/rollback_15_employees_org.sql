-- Откат M15: возвращает create_employee/update_employee версии Phase 3A, убирает табельный номер, даты и RPC подразделений.
drop function if exists create_employee(jsonb, text);
drop function if exists update_employee(uuid, jsonb, text);
create function create_employee(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_name text := trim(coalesce(p->>'full_name', ''));
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if v_name = '' then raise exception 'Укажите ФИО' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создание сотрудника'), true);
  insert into employees(canonical_id, full_name, name_norm, department_id, unit_id, "position")
  values (next_employee_code(), v_name, norm_name(v_name), nullif(p->>'department_id','')::bigint,
          nullif(p->>'unit_id','')::bigint, nullif(trim(coalesce(p->>'position','')), ''))
  returning id into v_id;
  return v_id;
end $$;;

create function update_employee(p_id uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare k text; v_r text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('full_name','department_id','unit_id','position','is_active') then
      raise exception 'Поле «%» нельзя менять', k using errcode = 'P0015'; end if;
  end loop;
  if p_patch ? 'full_name' and length(trim(coalesce(p_patch->>'full_name',''))) = 0 then
    raise exception 'ФИО не может быть пустым' using errcode = 'P0015'; end if;
  v_r := case when p_patch ? 'is_active' then req_reason(p_reason) else nullif(trim(coalesce(p_reason,'')), '') end;
  perform set_config('app.change_reason', coalesce(v_r, ''), true);
  update employees set
    full_name = case when p_patch ? 'full_name' then trim(p_patch->>'full_name') else full_name end,
    name_norm = case when p_patch ? 'full_name' then norm_name(p_patch->>'full_name') else name_norm end,
    department_id = case when p_patch ? 'department_id' then nullif(p_patch->>'department_id','')::bigint else department_id end,
    unit_id = case when p_patch ? 'unit_id' then nullif(p_patch->>'unit_id','')::bigint else unit_id end,
    "position" = case when p_patch ? 'position' then nullif(trim(coalesce(p_patch->>'position','')), '') else "position" end,
    is_active = case when p_patch ? 'is_active' then (p_patch->>'is_active')::boolean else is_active end,
    updated_at = now()
   where id = p_id;
  if not found then raise exception 'Сотрудник не найден' using errcode = 'P0015'; end if;
end $$;;

revoke execute on function create_employee(jsonb, text), update_employee(uuid, jsonb, text) from public, anon;
grant execute on function create_employee(jsonb, text), update_employee(uuid, jsonb, text) to authenticated;
alter table employee_contacts drop column if exists email;
alter table employees drop column if exists employee_code, drop column if exists hire_date, drop column if exists termination_date;
drop index if exists employees_name_key_idx, employees_active_idx, employees_unit_idx, employees_department_idx;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array['name_key','match_employee_candidates','match_names','create_org_unit','rename_org_unit','move_org_unit','set_org_unit_active']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
