-- HOTFIX · M30 — решения по сотрудникам в уже применённом импорте и массовые решения.
--
-- Ситуация: импорт сотрудников COMMITTED, часть строк осталась «Требует решения» (EMPLOYEE_FUZZY / AMBIGUOUS / NOT_FOUND). import_resolve_row
-- принимал решения только пока задание STAGED, а дозавершение M26 не применяло решения пользователя, поэтому такие строки нельзя было
-- довести до базы без нового импорта.
--
-- Что добавлено (всё SECURITY INVOKER, права и RLS не ослаблены):
--   1. import_resolve_row: решение допустимо и в COMMITTED, но только для сотрудников (entity = EMPLOYEES), только для строк с замечанием
--      по сотруднику и только пока строка не применена (applied_id IS NULL). Остальные проверки без изменений. В COMMITTED задание блокируется
--      (FOR UPDATE) — решение не гонится с применением пакета.
--   2. import_resolve_rows_bulk: массовое решение APPLY («создать как новых») / SKIP («пропустить») / CLEAR (снять решение) для строк с замечанием
--      по сотруднику. «Сопоставить» (MATCH) массово нельзя — оно требует выбора конкретного сотрудника на каждой строке.
--   3. import_decisions_summary: счётчики для панели (ничего не пишет).
--   4. import_apply_decided_batch: применяет решения APPLY/MATCH пакетами (курсор по row_no, причина обязательна, повтор идемпотентен).
--      APPLY не создаёт дубль: если сотрудник с таким табельным номером / ФИО / псевдонимом уже есть, строка помечается ошибкой с подсказкой
--      выбрать «Сопоставить». Ошибка одной строки откатывает только эту строку. Таймаут/отмена/блокировка откатывают весь пакет.
-- Функции M1–M29 (в том числе import_apply_resolved_batch) не меняются, кроме import_resolve_row (расширено условие статуса).

create or replace function import_resolve_row(p_row bigint, p_decision text, p_match uuid default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare r import_job_rows%rowtype; j import_jobs%rowtype;
begin
  select * into r from import_job_rows where id = p_row;
  if not found then raise exception 'Строка не найдена' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = r.job_id;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.status = 'COMMITTED' then
    -- применённый импорт: только сотрудники, только строки с замечанием по сотруднику, только ещё не применённые
    if j.entity <> 'EMPLOYEES' or r.review_code is null or r.review_code not in ('EMPLOYEE_NOT_FOUND', 'EMPLOYEE_AMBIGUOUS', 'EMPLOYEE_FUZZY') or r.applied_id is not null then
      raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
    select * into j from import_jobs where id = r.job_id for update;      -- не гоняться с применением пакета
    select * into r from import_job_rows where id = p_row;
    if j.status <> 'COMMITTED' or r.applied_id is not null then raise exception 'Строка уже применена' using errcode = 'P0015'; end if;
  elsif j.status <> 'STAGED' then raise exception 'Импорт уже завершён' using errcode = 'P0015';
  end if;
  if r.status <> 'NEEDS_REVIEW' then raise exception 'Строке не требуется решение' using errcode = 'P0015'; end if;
  if p_decision not in ('APPLY','SKIP','MATCH') then raise exception 'Неизвестное решение' using errcode = 'P0015'; end if;
  if p_decision = 'MATCH' and (p_match is null or not exists (select 1 from employees where id = p_match)) then
    raise exception 'Выберите сотрудника из справочника' using errcode = 'P0015'; end if;
  if p_decision = 'APPLY' and r.review_code in ('EMPLOYEE_NOT_FOUND','EMPLOYEE_AMBIGUOUS','EMPLOYEE_FUZZY') and j.entity <> 'EMPLOYEES' then
    raise exception 'Для сотрудника выберите «сопоставить» или «пропустить»: сотрудники из импорта списков не создаются' using errcode = 'P0015'; end if;
  update import_job_rows set decision = p_decision, decision_match = case when p_decision = 'MATCH' then p_match end, decided_by = auth.uid(), decided_at = now() where id = p_row;
  perform import_dq_sync(r.job_id, p_row, null, null, false);
end $$;

-- ---------- Массовое решение ----------
-- p_rows = null — все строки задания с замечанием по сотруднику без решения (для APPLY/SKIP) или с решением (для CLEAR), не больше p_limit за вызов;
-- remaining сообщает, сколько ещё осталось (клиент повторяет вызов). p_rows задан — только эти строки (не больше 300).
create or replace function import_resolve_rows_bulk(p_job uuid, p_decision text, p_rows bigint[] default null, p_limit integer default 300) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; r record; v_n int := 0; v_remaining int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'Размер пакета от 1 до 500' using errcode = 'P0015'; end if;
  if p_decision not in ('APPLY', 'SKIP', 'CLEAR') then raise exception 'Неизвестное решение' using errcode = 'P0015'; end if;
  if p_rows is not null and cardinality(p_rows) > 500 then raise exception 'Не больше 500 строк за раз' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = p_job for update;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Массовые решения доступны только для импорта сотрудников' using errcode = 'P0015'; end if;
  if j.status not in ('STAGED', 'COMMITTED') then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  for r in select id from import_job_rows
            where job_id = p_job and status = 'NEEDS_REVIEW' and review_code in ('EMPLOYEE_NOT_FOUND', 'EMPLOYEE_AMBIGUOUS', 'EMPLOYEE_FUZZY') and applied_id is null
              and (p_rows is null or id = any (p_rows))
              and (case when p_rows is not null then true when p_decision = 'CLEAR' then decision is not null else decision is null end)
            order by row_no limit p_limit loop
    if p_decision = 'CLEAR' then
      update import_job_rows set decision = null, decision_match = null, decided_by = null, decided_at = null where id = r.id;
    else
      update import_job_rows set decision = p_decision, decision_match = null, decided_by = auth.uid(), decided_at = now() where id = r.id;
    end if;
    perform import_dq_sync(p_job, r.id, null, null, false);
    v_n := v_n + 1;
  end loop;
  select count(*) into v_remaining from import_job_rows
   where job_id = p_job and status = 'NEEDS_REVIEW' and review_code in ('EMPLOYEE_NOT_FOUND', 'EMPLOYEE_AMBIGUOUS', 'EMPLOYEE_FUZZY') and applied_id is null
     and p_rows is null and (case when p_decision = 'CLEAR' then decision is not null else decision is null end);
  return jsonb_build_object('changed', v_n, 'remaining', v_remaining, 'done', v_remaining = 0);
end $$;

-- ---------- Счётчики решений ----------
create or replace function import_decisions_summary(p_job uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare j import_jobs%rowtype;
begin
  select * into j from import_jobs where id = p_job;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Решения по сотрудникам доступны только для импорта сотрудников' using errcode = 'P0015'; end if;
  return (select jsonb_build_object(
    'job_status', j.status,
    'undecided', count(*) filter (where decision is null),
    'to_create', count(*) filter (where decision = 'APPLY'),
    'to_match', count(*) filter (where decision = 'MATCH'),
    'to_skip', count(*) filter (where decision = 'SKIP'),
    'errors', count(*) filter (where apply_action = 'ERROR'),
    'total', count(*))
    from import_job_rows
   where job_id = p_job and status = 'NEEDS_REVIEW' and review_code in ('EMPLOYEE_NOT_FOUND', 'EMPLOYEE_AMBIGUOUS', 'EMPLOYEE_FUZZY') and applied_id is null);
end $$;

-- ---------- Применение решений пакетами ----------
create or replace function import_apply_decided_batch(p_job uuid, p_limit integer default 50, p_after integer default 0, p_reason text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; r import_job_rows%rowtype; v_reason text; v_emp uuid; v_id uuid; v_action text; v_patch jsonb; d jsonb; c jsonb; v_code text; v_name text;
        v_created int := 0; v_updated int := 0; v_err int := 0; v_done int := 0; v_last int := coalesce(p_after, 0); v_remaining int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 300 then raise exception 'Размер пакета от 1 до 300' using errcode = 'P0015'; end if;
  v_reason := req_reason(p_reason);
  select * into j from import_jobs where id = p_job for update;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Применение решений доступно только для импорта сотрудников' using errcode = 'P0015'; end if;
  if j.status <> 'COMMITTED' then raise exception 'Применение решений доступно только для применённого импорта' using errcode = 'P0015'; end if;
  v_reason := 'Решения по сотрудникам импорта «' || left(j.file_name, 120) || '»: ' || v_reason;
  perform set_config('app.change_reason', v_reason, true);
  for r in select * from import_job_rows
            where job_id = p_job and row_no > coalesce(p_after, 0) and status = 'NEEDS_REVIEW' and decision in ('APPLY', 'MATCH') and applied_id is null
              and review_code in ('EMPLOYEE_NOT_FOUND', 'EMPLOYEE_AMBIGUOUS', 'EMPLOYEE_FUZZY')
            order by row_no limit p_limit loop
    v_last := r.row_no; v_done := v_done + 1;
    begin
      d := r.data;
      v_name := trim(coalesce(d->>'full_name', '')); v_code := nullif(trim(coalesce(d->>'employee_code', '')), '');
      if v_name = '' then raise exception 'Не указано ФИО' using errcode = 'P0015'; end if;
      if r.decision = 'MATCH' then
        v_emp := r.decision_match;
        if v_emp is null or not exists (select 1 from employees where id = v_emp) then raise exception 'Сотрудник для сопоставления не найден' using errcode = 'P0015'; end if;
      else
        v_emp := null;
        -- явное решение «создать» не должно порождать дубль: точное совпадение по коду / ФИО / псевдониму — только «Сопоставить»
        c := import_match_employees_fast(v_name, v_code);
        if exists (select 1 from jsonb_array_elements(c) c2 where c2->>'match_kind' in ('CODE', 'EXACT', 'ALIAS')) then
          raise exception 'Сотрудник с таким табельным номером или ФИО уже есть: выберите «Сопоставить»' using errcode = 'P0015'; end if;
      end if;
      if v_code is not null and exists (select 1 from employees where lower(employee_code) = lower(v_code) and id is distinct from v_emp) then
        raise exception 'Табельный номер % уже принадлежит другому сотруднику', v_code using errcode = 'P0015'; end if;
      if v_emp is null then
        v_id := create_employee(d, v_reason); v_action := 'CREATED';
      else
        v_patch := d - 'full_name' - 'employee_code' || jsonb_build_object('full_name', d->>'full_name');
        if v_code is not null then v_patch := v_patch || jsonb_build_object('employee_code', v_code); end if;
        perform update_employee(v_emp, v_patch, v_reason); v_id := v_emp; v_action := 'UPDATED';
      end if;
      perform import_lineage(p_job, r.row_no, md5(r.raw::text), 'employees', v_id);
      update import_job_rows set applied_id = v_id, apply_action = v_action, apply_error = null, status = case when v_action = 'CREATED' then 'NEW' else 'UPDATED' end,
             review_code = null, match_id = case when v_action = 'UPDATED' then v_id else match_id end, reapplied_at = now(), reapplied_by = auth.uid(),
             messages = messages || array['Применено по решению пользователя'] where id = r.id;
      perform import_dq_sync(p_job, r.id, null, null, false);
      if v_action = 'CREATED' then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    exception
      when query_canceled or lock_not_available or deadlock_detected then raise;
      when others then
        update import_job_rows set apply_action = 'ERROR', apply_error = left(sqlerrm, 500), reapplied_at = now(), reapplied_by = auth.uid() where id = r.id;
        -- решение не применено: замечание снова открыто, чтобы строка не пропала из «Качества данных»
        perform import_dq_sync(p_job, r.id, r.review_code, 'Импорт «' || j.file_name || '», строка ' || r.row_no || ': решение не применено — ' || left(sqlerrm, 200), true);
        v_err := v_err + 1;
    end;
  end loop;
  perform import_job_recount(p_job);
  select count(*) into v_remaining from import_job_rows
   where job_id = p_job and row_no > v_last and status = 'NEEDS_REVIEW' and decision in ('APPLY', 'MATCH') and applied_id is null
     and review_code in ('EMPLOYEE_NOT_FOUND', 'EMPLOYEE_AMBIGUOUS', 'EMPLOYEE_FUZZY');
  return jsonb_build_object('processed', v_done, 'created', v_created, 'updated', v_updated, 'errors', v_err,
                            'next_after', v_last, 'remaining', v_remaining, 'done', v_remaining = 0);
end $$;

do $$ declare f text; begin
  foreach f in array array['import_resolve_row(bigint, text, uuid)', 'import_resolve_rows_bulk(uuid, text, bigint[], integer)',
                           'import_decisions_summary(uuid)', 'import_apply_decided_batch(uuid, integer, integer, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
