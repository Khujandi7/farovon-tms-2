-- M24 (Phase 3C): управление оргструктурой и разрешение замечаний импорта «Подразделение не найдено».
-- Только функции — схема (таблицы org_units/org_unit_aliases, связи сотрудников, RLS, аудит) не меняется;
-- она уже заведена в Phase 1 / M11 / M15 и для этой задачи достаточна. Откат (rollback_24) снимает только эти функции.
--
-- Безопасность: все функции SECURITY INVOKER (выполняются с правами вызывающего, RLS действует), search_path = public, pg_temp,
-- доступ только authenticated (anon/public отозваны). Запись в org_units / org_unit_aliases попадает в audit_log триггером trg_audit
-- с причиной из app.change_reason. Закрытие замечаний Data Quality — существующая import_dq_sync (SECURITY DEFINER, сама проверяет can_import).
--
-- Добавляется:
--   • add_org_unit_alias     — закрепить подтверждённое написание за подразделением (без авто-объединения разных).
--   • import_reanalyze_row    — повторно разобрать строку импорта со статусом UNIT_UNKNOWN после создания/сопоставления подразделения.
--   • create_org_units_bulk   — массовое создание подразделений из подготовленной таблицы (дубликаты пропускаются, неоднозначное — ошибка).

-- ---------- Подтверждённые псевдонимы подразделений ----------
-- Идемпотентна: повтор того же написания для того же подразделения ничего не меняет. Не даёт закрепить написание, которое уже
-- принадлежит другому подразделению или совпадает с названием другого подразделения того же уровня (иначе импорт стал бы неоднозначным).
create function add_org_unit_alias(p_id bigint, p_alias text, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare u org_units%rowtype; v_norm text; v_exist bigint;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if length(trim(coalesce(p_alias, ''))) < 2 then raise exception 'Укажите написание подразделения' using errcode = 'P0015'; end if;
  if length(trim(p_alias)) > 200 then raise exception 'Написание длиннее 200 символов' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', req_reason(p_reason), true);
  select * into u from org_units where id = p_id for update;
  if not found then raise exception 'Подразделение не найдено' using errcode = 'P0015'; end if;
  if not u.is_active then raise exception 'Подразделение неактивно: сначала восстановите его' using errcode = 'P0015'; end if;
  v_norm := norm_name(p_alias);
  if v_norm = '' then raise exception 'Укажите написание подразделения' using errcode = 'P0015'; end if;
  if norm_name(u.name) = v_norm then return; end if;              -- совпадает с самим названием — псевдоним не нужен
  select org_unit_id into v_exist from org_unit_aliases where alias_norm = v_norm;
  if v_exist = p_id then return; end if;                           -- уже закреплено за этим подразделением
  if v_exist is not null then
    raise exception 'Написание «%» уже закреплено за другим подразделением', p_alias using errcode = 'P0015'; end if;
  if exists (select 1 from org_units o where o.id <> p_id and o.level = u.level and o.is_active and norm_name(o.name) = v_norm) then
    raise exception 'Написание «%» совпадает с названием другого подразделения', p_alias using errcode = 'P0015'; end if;
  insert into org_unit_aliases(org_unit_id, alias_norm) values (p_id, v_norm);
end $$;

-- ---------- Повторный разбор строки импорта по подразделению ----------
-- Исходные названия берём из сообщений строки («Подразделение «X» не найдено», «Отдел «Y» не найден»): так работает и для заданий,
-- загруженных до этой миграции. Названия ищутся тем же find_org_units, что и при загрузке (с псевдонимами, только действующие,
-- результат должен быть однозначным). Остальные данные строки не меняются.
--   • все названия разрешились и решения по строке не было → строка возвращается в обычный статус (NEW/UPDATED), замечание закрывается;
--   • разрешились, но пользователь уже принял решение (пропустить/применить/сопоставить) → решение сохраняется как есть, статус
--     остаётся «на проверке», замечание закрывается, org-поля в данных обновляются (применение учтёт и решение, и подразделение);
--   • не разрешились → остаётся на ручной проверке, замечание обновляется.
-- Идемпотентна: повтор на уже разрешённой строке — no-op. Задание блокируется (for update), как в import_commit(_batch): гонки с применением нет.
create function import_reanalyze_row(p_row bigint) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare r import_job_rows%rowtype; j import_jobs%rowtype; d jsonb; m text; nm text; ids bigint[];
        v_dept bigint; v_unit bigint; new_msgs text[] := '{}'; still text := null; new_status text; v_ok text := 'Подразделение найдено в справочнике';
begin
  select job_id into j.id from import_job_rows where id = p_row;
  if not found then raise exception 'Строка не найдена' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = j.id for update;
  if not found then raise exception 'Строка не найдена' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  select * into r from import_job_rows where id = p_row for update;
  if j.entity <> 'EMPLOYEES' then raise exception 'Подразделения разбираются только в импорте сотрудников' using errcode = 'P0015'; end if;
  if j.status <> 'STAGED' then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  if r.review_code is distinct from 'UNIT_UNKNOWN' then
    if r.status in ('NEW', 'UPDATED', 'UNCHANGED') then   -- уже разрешена (или замечаний по подразделению не было): повтор безопасен
      return jsonb_build_object('resolved', true, 'status', r.status, 'noop', true, 'messages', to_jsonb(r.messages));
    end if;
    raise exception 'Строке не требуется разбор подразделения' using errcode = 'P0015';
  end if;
  perform set_config('app.change_reason', 'Повторная проверка строки импорта: ' || left(j.file_name, 150), true);
  d := r.data;
  v_dept := nullif(d->>'department_id', '')::bigint;
  v_unit := nullif(d->>'unit_id', '')::bigint;
  foreach m in array r.messages loop
    nm := (regexp_match(m, '^Подразделение «(.*)» (?:не найдено|неоднозначно)$'))[1];
    if nm is not null then
      ids := find_org_units(nm, 'DEPARTMENT');
      if coalesce(array_length(ids, 1), 0) = 1 then v_dept := ids[1];
      else new_msgs := new_msgs || m; still := coalesce(still, nm); end if;
      continue;
    end if;
    nm := (regexp_match(m, '^Отдел «(.*)» (?:не найден|неоднозначен)$'))[1];
    if nm is not null then
      ids := find_org_units(nm, 'UNIT', v_dept);
      if coalesce(array_length(ids, 1), 0) = 1 then
        v_unit := ids[1];
        if v_dept is null then select parent_id into v_dept from org_units where id = v_unit; end if;
      else new_msgs := new_msgs || m; still := coalesce(still, nm); end if;
      continue;
    end if;
    if m <> v_ok then new_msgs := new_msgs || m; end if;   -- иные сообщения сохраняем как есть
  end loop;
  if v_dept is not null then d := d || jsonb_build_object('department_id', v_dept); end if;
  if v_unit is not null then d := d || jsonb_build_object('unit_id', v_unit); end if;
  if still is null then
    new_msgs := new_msgs || v_ok;
    if r.decision is null then
      new_status := case when r.match_id is not null then 'UPDATED' else 'NEW' end;
      update import_job_rows set data = d, status = new_status, review_code = null, messages = new_msgs where id = p_row;
    else   -- осознанное решение пользователя не затираем
      new_status := r.status;
      update import_job_rows set data = d, messages = new_msgs where id = p_row;
    end if;
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
  return jsonb_build_object('resolved', still is null, 'status', new_status, 'noop', false,
         'department_id', v_dept, 'unit_id', v_unit, 'messages', to_jsonb(new_msgs));
end $$;

-- ---------- Массовое добавление подразделений ----------
-- Каждая строка: {name, parent?}. parent — название действующего департамента (или его подтверждённое написание); пусто → департамент,
-- иначе отдел в этом департаменте. Родитель ищется тем же find_org_units, что и импорт: не найден или неоднозначен → ошибка строки,
-- ничего не создаётся «по догадке». Дубликаты (название или подтверждённое написание на том же уровне) пропускаются с причиной;
-- совпадение с неактивным подразделением — ошибка (его нужно восстановить, а не создавать второе). Подтверждение пользователя
-- обеспечивает UI (предпросмотр перед вызовом); функция идемпотентна: повторный вызов с тем же списком создаёт 0 записей.
create function create_org_units_bulk(p_rows jsonb, p_reason text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare r jsonb; v_name text; v_pname text; v_parent bigint; v_ids bigint[]; v_created int := 0; v_skipped int := 0;
        v_errors jsonb := '[]'::jsonb; v_skips jsonb := '[]'::jsonb; v_idx int := 0; v_level org_level; v_dup record;
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
    if length(v_name) < 2 or norm_name(v_name) = '' then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('index', v_idx, 'name', v_name, 'error', 'Название короче 2 символов')); continue; end if;
    if length(v_name) > 200 then
      v_errors := v_errors || jsonb_build_array(jsonb_build_object('index', v_idx, 'name', left(v_name, 60), 'error', 'Название длиннее 200 символов')); continue; end if;
    v_parent := null; v_level := 'DEPARTMENT';
    if v_pname is not null then
      v_ids := find_org_units(v_pname, 'DEPARTMENT');
      if coalesce(array_length(v_ids, 1), 0) = 0 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('index', v_idx, 'name', v_name, 'error', 'Департамент «' || v_pname || '» не найден')); continue; end if;
      if array_length(v_ids, 1) > 1 then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('index', v_idx, 'name', v_name, 'error', 'Департамент «' || v_pname || '» неоднозначен')); continue; end if;
      v_parent := v_ids[1]; v_level := 'UNIT';
    end if;
    -- совпадение с названием того же уровня и родителя (в том числе неактивным) или с подтверждённым написанием
    select o.id, o.is_active, false as via_alias into v_dup from org_units o
     where o.level = v_level and coalesce(o.parent_id, 0) = coalesce(v_parent, 0) and norm_name(o.name) = norm_name(v_name) limit 1;
    if not found then
      select o.id, o.is_active, true as via_alias into v_dup from org_unit_aliases a join org_units o on o.id = a.org_unit_id
       where a.alias_norm = norm_name(v_name) and o.level = v_level and coalesce(o.parent_id, 0) = coalesce(v_parent, 0) limit 1;
    end if;
    if found then
      if not v_dup.is_active then
        v_errors := v_errors || jsonb_build_array(jsonb_build_object('index', v_idx, 'name', v_name, 'error', 'Есть неактивное подразделение с таким названием — восстановите его'));
      else
        v_skipped := v_skipped + 1;
        v_skips := v_skips || jsonb_build_array(jsonb_build_object('index', v_idx, 'name', v_name,
                    'reason', case when v_dup.via_alias then 'Совпадает с подтверждённым написанием существующего подразделения' else 'Уже есть в справочнике' end));
      end if;
      continue;
    end if;
    begin
      insert into org_units(parent_id, name, level) values (v_parent, v_name, v_level);
      v_created := v_created + 1;
    exception when unique_violation then   -- совпадение по lower(name), не пойманное norm_name: считаем дублем
      v_skipped := v_skipped + 1;
      v_skips := v_skips || jsonb_build_array(jsonb_build_object('index', v_idx, 'name', v_name, 'reason', 'Уже есть в справочнике'));
    end;
  end loop;
  return jsonb_build_object('created', v_created, 'skipped', v_skipped, 'errors', v_errors, 'skipped_items', v_skips);
end $$;

revoke execute on function add_org_unit_alias(bigint, text, text), import_reanalyze_row(bigint),
  create_org_units_bulk(jsonb, text) from public, anon;
grant execute on function add_org_unit_alias(bigint, text, text), import_reanalyze_row(bigint),
  create_org_units_bulk(jsonb, text) to authenticated;
