-- M24 (Phase 3C): управление оргструктурой и разрешение замечаний импорта «Подразделение не найдено».
-- Только функции — схема (таблицы org_units/org_unit_aliases, связи сотрудников, RLS, аудит) не меняется;
-- она уже заведена в Phase 1 / M15 и для этой задачи достаточна. Соответственно отпечаток таблиц не меняется,
-- откат (rollback_24) снимает только эти функции.
--
-- Добавляется:
--   • add_org_unit_alias     — закрепить подтверждённое написание за подразделением (без авто-объединения разных).
--   • import_reanalyze_row    — повторно разобрать строку импорта со статусом UNIT_UNKNOWN после создания/сопоставления
--                               подразделения; исходное название берётся из сообщений строки, поэтому работает и для
--                               уже загруженных заданий (без повторного импорта файла).
--   • create_org_units_bulk   — массовое создание подразделений из подготовленной таблицы (дубликаты пропускаются).

-- ---------- Подтверждённые псевдонимы подразделений ----------
-- Закрепляет альтернативное написание за существующим подразделением: импорт по этому названию будет находить его.
-- Разные подразделения не объединяются: одно написание не может указывать на два подразделения (unique alias_norm + явная проверка).
create function add_org_unit_alias(p_id bigint, p_alias text, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare u org_units%rowtype; v_norm text; v_exist bigint;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if length(trim(coalesce(p_alias, ''))) < 2 then raise exception 'Укажите написание подразделения' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', req_reason(p_reason), true);
  select * into u from org_units where id = p_id;
  if not found then raise exception 'Подразделение не найдено' using errcode = 'P0015'; end if;
  v_norm := norm_name(p_alias);
  if norm_name(u.name) = v_norm then return; end if;              -- совпадает с самим названием — псевдоним не нужен
  select org_unit_id into v_exist from org_unit_aliases where alias_norm = v_norm;
  if v_exist is not null and v_exist <> p_id then
    raise exception 'Написание «%» уже закреплено за другим подразделением', p_alias using errcode = 'P0015'; end if;
  insert into org_unit_aliases(org_unit_id, alias_norm) values (p_id, v_norm) on conflict (alias_norm) do nothing;
end $$;

-- ---------- Повторный разбор строки импорта по подразделению ----------
-- Исходные названия берём из сообщений строки («Подразделение «X» не найдено», «Отдел «Y» не найден») — так разбор
-- работает и для строк, загруженных до этой миграции. Заново ищем их в справочнике (с учётом псевдонимов); найденные
-- id проставляем в data. Если все названия разрешились — строка возвращается в обычный статус (NEW/UPDATED), замечание
-- Data Quality закрывается. Иначе остаётся на ручной проверке с обновлённым сообщением. Правка только оргструктурных
-- полей: остальные данные строки не трогаются.
create function import_reanalyze_row(p_row bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare r import_job_rows%rowtype; j import_jobs%rowtype; d jsonb; m text; nm text; ids bigint[];
        v_dept bigint; v_unit bigint; new_msgs text[] := '{}'; still text := null; new_status text;
begin
  select * into r from import_job_rows where id = p_row;
  if not found then raise exception 'Строка не найдена' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = r.job_id;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.status <> 'STAGED' then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  if r.review_code is distinct from 'UNIT_UNKNOWN' then raise exception 'Строке не требуется разбор подразделения' using errcode = 'P0015'; end if;
  d := r.data;
  v_dept := nullif(d->>'department_id', '')::bigint;
  v_unit := nullif(d->>'unit_id', '')::bigint;
  foreach m in array r.messages loop
    nm := substring(m from 'Подразделение «(.*)»');
    if nm is not null then
      ids := find_org_units(nm, 'DEPARTMENT');
      if coalesce(array_length(ids, 1), 0) = 1 then v_dept := ids[1];
      else new_msgs := new_msgs || m; still := coalesce(still, nm); end if;
      continue;
    end if;
    nm := substring(m from 'Отдел «(.*)»');
    if nm is not null then
      ids := find_org_units(nm, 'UNIT', v_dept);
      if coalesce(array_length(ids, 1), 0) = 1 then
        v_unit := ids[1];
        if v_dept is null then select parent_id into v_dept from org_units where id = v_unit; end if;
      else new_msgs := new_msgs || m; still := coalesce(still, nm); end if;
      continue;
    end if;
    new_msgs := new_msgs || m;   -- иные сообщения сохраняем как есть
  end loop;
  if v_dept is not null then d := d || jsonb_build_object('department_id', v_dept); end if;
  if v_unit is not null then d := d || jsonb_build_object('unit_id', v_unit); end if;
  if still is null then
    new_status := case when r.match_id is not null then 'UPDATED' else 'NEW' end;
    update import_job_rows set data = d, status = new_status, review_code = null, messages = new_msgs,
           decision = null, decision_match = null, decided_by = null, decided_at = null
     where id = p_row;
    perform import_dq_sync(r.job_id, p_row, null, null, false);
  else
    new_status := 'NEEDS_REVIEW';
    update import_job_rows set data = d, messages = new_msgs where id = p_row;
    perform import_dq_sync(r.job_id, p_row, 'UNIT_UNKNOWN',
      'Импорт «' || j.file_name || '», строка ' || r.row_no || ': ' || coalesce(new_msgs[1], 'подразделение не найдено'), true);
  end if;
  update import_jobs x set total_rows = c.t, new_rows = c.n, updated_rows = c.u, unchanged_rows = c.xx,
         duplicate_rows = c.dd, review_rows = c.rr, error_rows = c.ee
    from (select count(*) t, count(*) filter (where status = 'NEW') n, count(*) filter (where status = 'UPDATED') u,
                 count(*) filter (where status = 'UNCHANGED') xx, count(*) filter (where status = 'DUPLICATE') dd,
                 count(*) filter (where status = 'NEEDS_REVIEW') rr, count(*) filter (where status = 'ERROR') ee
            from import_job_rows where job_id = r.job_id) c where x.id = r.job_id;
  return jsonb_build_object('resolved', still is null, 'status', new_status,
         'department_id', v_dept, 'unit_id', v_unit, 'messages', to_jsonb(new_msgs));
end $$;

-- ---------- Массовое добавление подразделений ----------
-- Каждая строка: {name, parent?}. parent — название действующего департамента (или его псевдоним); пусто → создаётся
-- департамент, иначе отдел в этом департаменте. Дубликаты (по названию или псевдониму на том же уровне) пропускаются,
-- строки с ошибками собираются в errors и НЕ создаются. Весь вызов — одна транзакция; подтверждение — на стороне UI
-- (предпросмотр перед вызовом). Разные подразделения не объединяются: совпадение имени только пропускает строку.
create function create_org_units_bulk(p_rows jsonb, p_reason text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare r jsonb; v_name text; v_pname text; v_parent bigint; v_created int := 0; v_skipped int := 0;
        v_errors jsonb := '[]'::jsonb; v_idx int := 0;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Ожидался список подразделений' using errcode = 'P0015'; end if;
  if jsonb_array_length(p_rows) = 0 then raise exception 'Список пуст' using errcode = 'P0015'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'Не больше 1000 строк за раз' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason, '')), ''), 'Массовое добавление подразделений'), true);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_idx := v_idx + 1;
    v_name := trim(coalesce(r->>'name', ''));
    v_pname := nullif(trim(coalesce(r->>'parent', '')), '');
    if length(v_name) < 2 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('index', v_idx, 'name', v_name, 'error', 'Название короче 2 символов')); continue; end if;
    v_parent := null;
    if v_pname is not null then
      select u.id into v_parent from org_units u where u.level = 'DEPARTMENT' and u.is_active and norm_name(u.name) = norm_name(v_pname) limit 1;
      if v_parent is null then
        select a.org_unit_id into v_parent from org_unit_aliases a join org_units u on u.id = a.org_unit_id
         where u.level = 'DEPARTMENT' and u.is_active and a.alias_norm = norm_name(v_pname) limit 1; end if;
      if v_parent is null then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('index', v_idx, 'name', v_name, 'error', 'Департамент-родитель «' || v_pname || '» не найден')); continue; end if;
    end if;
    if exists (select 1 from org_units where coalesce(parent_id, 0) = coalesce(v_parent, 0) and lower(name) = lower(v_name))
       or exists (select 1 from org_unit_aliases a join org_units u on u.id = a.org_unit_id
                   where a.alias_norm = norm_name(v_name) and coalesce(u.parent_id, 0) = coalesce(v_parent, 0)) then
      v_skipped := v_skipped + 1; continue;
    end if;
    insert into org_units(parent_id, name, level)
    values (v_parent, v_name, case when v_parent is null then 'DEPARTMENT' else 'UNIT' end::org_level);
    v_created := v_created + 1;
  end loop;
  return jsonb_build_object('created', v_created, 'skipped', v_skipped, 'errors', v_errors);
end $$;

revoke execute on function add_org_unit_alias(bigint, text, text), import_reanalyze_row(bigint),
  create_org_units_bulk(jsonb, text) from public, anon;
grant execute on function add_org_unit_alias(bigint, text, text), import_reanalyze_row(bigint),
  create_org_units_bulk(jsonb, text) to authenticated;
