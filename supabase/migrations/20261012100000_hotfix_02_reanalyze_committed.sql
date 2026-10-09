-- M25 (hotfix): разрешение замечаний «Подразделение/Отдел не найден(о)» в УЖЕ ПРИМЕНЁННОМ импорте сотрудников.
-- Причина: M24 разрешал повторный разбор только для задания STAGED; после применения (COMMITTED) строки с UNIT_UNKNOWN остаются
-- NEEDS_REVIEW/пропущенными, и разобрать их было нельзя. Меняется только функция import_reanalyze_row (create or replace, права сохраняются).
-- Сотрудники НЕ создаются и не обновляются, apply_action/processed_at/applied_id и счётчики применения не меняются; обновляются данные
-- подразделения в строке, её статус/сообщения, замечание DQ и счётчики разбора (new/updated/review/conflicts). M1–M24 не изменены.

create or replace function import_reanalyze_row(p_row bigint) returns jsonb
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
  -- Разбор допустим, пока задание не отменено и не выполняется: STAGED (до применения) и COMMITTED (после применения, когда строки
  -- с UNIT_UNKNOWN были пропущены). Для применённого задания сотрудники и счётчики применения НЕ меняются — только разбор строки.
  if j.status not in ('STAGED', 'COMMITTED') then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
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
  if j.status = 'COMMITTED' then   -- как в import_commit_batch: «без решения» = строки на проверке; inserted/updated/skipped/apply_errors не трогаем
    update import_jobs set conflicts = (select count(*) from import_job_rows where job_id = r.job_id and status = 'NEEDS_REVIEW') where id = r.job_id;
  end if;
  return jsonb_build_object('resolved', still is null, 'status', new_status, 'noop', false,
         'department_id', v_dept, 'unit_id', v_unit, 'messages', to_jsonb(new_msgs));
end $$;
