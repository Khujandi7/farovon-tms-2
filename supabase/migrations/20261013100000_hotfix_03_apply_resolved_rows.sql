-- HOTFIX · M26 — дозавершение применённого импорта сотрудников: пакетный разбор подразделений и применение разрешённых строк.
--
-- Ситуация: задание COMMITTED, все строки с замечанием UNIT_UNKNOWN были пропущены (apply_action = 'SKIPPED'). После исправления справочника
-- (M24/M25) строка получает статус NEW/UPDATED, но сотрудник не создаётся: перепроверка не меняет apply_action/processed_at и счётчики применения.
--
-- Почему безопасно продолжать то же задание (а не создавать новое):
--   • строка вида apply_action = 'SKIPPED' + applied_id IS NULL + status IN ('NEW','UPDATED') возможна только после разбора M25 в применённом задании:
--     реально применённые строки имеют apply_action CREATED/UPDATED и applied_id; строки, пропущенные по статусу (UNCHANGED/DUPLICATE/ERROR) или по
--     решению пользователя (NEEDS_REVIEW + SKIP), в эту выборку не попадают;
--   • processed_at не меняется (история первого применения сохраняется), итог повторного применения пишется в apply_action/applied_id и
--     в новые поля reapplied_at/reapplied_by (когда и кем строка доведена);
--   • перед записью сотрудник СОПОСТАВЛЯЕТСЯ ЗАНОВО (код → ФИО → псевдоним, как при загрузке): если за время ожидания такой сотрудник уже появился,
--     строка обновляет его, а не создаёт дубль; неоднозначное совпадение возвращается на ручную проверку и не применяется;
--   • применённая строка перестаёт попадать в выборку → повтор и возобновление после сбоя идемпотентны; ошибка строки не откатывает остальные.
-- Существующие функции M1–M25 не переопределяются. Все новые функции — SECURITY INVOKER, кроме узкого помощника сопоставления
-- (по тем же причинам, что import_analyze_row_fast: под RLS сопоставление ~90 мс на строку, без RLS ~2,5 мс).

alter table import_job_rows add column reapplied_at timestamptz;
alter table import_job_rows add column reapplied_by uuid;
create index import_job_rows_reapply_idx on import_job_rows (job_id, row_no)
  where applied_id is null and reapplied_at is null and apply_action = 'SKIPPED' and status in ('NEW', 'UPDATED');

-- ---------- Помощник: кандидаты сотрудника (быстро, с проверкой права импорта) ----------
create function import_match_employees_fast(p_name text, p_code text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not can_import('EMPLOYEES') then raise exception 'Недостаточно прав для импорта «EMPLOYEES»' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('employee_id', employee_id, 'match_kind', match_kind) order by
                     case match_kind when 'CODE' then 1 when 'EXACT' then 2 when 'ALIAS' then 3 when 'REORDERED' then 4 else 5 end)
                     from match_employee_candidates(p_name, p_code, false)), '[]'::jsonb);
end $$;

-- ---------- Пересчёт счётчиков задания из строк (как import_commit_batch + счётчики статусов) ----------
create function import_job_recount(p_job uuid) returns void
language sql set search_path = public, pg_temp as $$
  update import_jobs x set total_rows = c.t, new_rows = c.n, updated_rows = c.u, unchanged_rows = c.xx, duplicate_rows = c.dd, review_rows = c.rr, error_rows = c.ee,
         inserted = c.ins, updated = c.upd, skipped = c.skp, apply_errors = c.aer, conflicts = c.rr
    from (select count(*) t, count(*) filter (where status = 'NEW') n, count(*) filter (where status = 'UPDATED') u,
                 count(*) filter (where status = 'UNCHANGED') xx, count(*) filter (where status = 'DUPLICATE') dd,
                 count(*) filter (where status = 'NEEDS_REVIEW') rr, count(*) filter (where status = 'ERROR') ee,
                 count(*) filter (where apply_action = 'CREATED') ins, count(*) filter (where apply_action = 'UPDATED') upd,
                 count(*) filter (where apply_action = 'SKIPPED') skp, count(*) filter (where apply_action = 'ERROR') aer
            from import_job_rows where job_id = p_job) c
   where x.id = p_job
$$;

-- ---------- 1. Пакетный повторный разбор подразделений ----------
-- Берёт следующие p_limit строк NEEDS_REVIEW/UNIT_UNKNOWN (по id, после p_after) и вызывает import_reanalyze_row (M24/M25): учитываются
-- подтверждённые псевдонимы и созданные подразделения. Идемпотентна; повтор с p_after = 0 просто проходит оставшиеся нерешённые строки.
create function import_reanalyze_job(p_job uuid, p_limit integer default 100, p_after bigint default 0) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; r record; v_res jsonb; v_proc int := 0; v_ok int := 0; v_still int := 0; v_err int := 0; v_last bigint := coalesce(p_after, 0); v_first_err text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 300 then raise exception 'Размер пакета от 1 до 300' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = p_job;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Подразделения разбираются только в импорте сотрудников' using errcode = 'P0015'; end if;
  if j.status not in ('STAGED', 'COMMITTED') then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  for r in select id from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW' and review_code = 'UNIT_UNKNOWN' and decision is null and id > coalesce(p_after, 0) order by id limit p_limit loop
    v_last := r.id; v_proc := v_proc + 1;
    begin
      v_res := import_reanalyze_row(r.id);
      if coalesce((v_res->>'resolved')::boolean, false) then v_ok := v_ok + 1; else v_still := v_still + 1; end if;
    exception
      when query_canceled or lock_not_available or deadlock_detected then raise;
      when others then v_err := v_err + 1; v_first_err := coalesce(v_first_err, sqlerrm);
    end;
  end loop;
  return jsonb_build_object('processed', v_proc, 'resolved', v_ok, 'unresolved', v_still, 'errors', v_err, 'first_error', v_first_err,
                            'next_after', v_last, 'done', v_proc < p_limit,
                            'remaining', (select count(*) from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW' and review_code = 'UNIT_UNKNOWN' and decision is null and id > v_last));
end $$;

-- ---------- 2. Предпросмотр дозавершения (ничего не пишет) ----------
-- unresolved_names — до 20 названий, которых нет в справочнике, с числом строк (чтобы создать их одним списком, а не по строке). Строки с явным решением пользователя (skipped_by_decision) не разбираются и не применяются. Счётчики считаются по строкам; sample — до 10 ближайших к применению строк со свежим сопоставлением сотрудника.
create function import_resolved_preview(p_job uuid) returns jsonb
language plpgsql stable set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; v_sample jsonb := '[]'::jsonb; r record; c jsonb; v_kind text; v_n int;
begin
  select * into j from import_jobs where id = p_job;
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Дозавершение доступно только для импорта сотрудников' using errcode = 'P0015'; end if;
  for r in select id, row_no, match_id, data from import_job_rows
            where job_id = p_job and applied_id is null and apply_action = 'SKIPPED' and status in ('NEW', 'UPDATED') order by row_no limit 10 loop
    c := import_match_employees_fast(r.data->>'full_name', nullif(trim(coalesce(r.data->>'employee_code', '')), ''));
    select c2->>'match_kind', count(*) into v_kind, v_n from jsonb_array_elements(c) c2 group by 1 order by min(case c2->>'match_kind' when 'CODE' then 1 when 'EXACT' then 2 when 'ALIAS' then 3 when 'REORDERED' then 4 else 5 end) limit 1;
    v_sample := v_sample || jsonb_build_array(jsonb_build_object('row_no', r.row_no, 'full_name', r.data->>'full_name', 'employee_code', r.data->>'employee_code',
      'verdict', case when jsonb_array_length(c) = 0 then 'CREATE' when v_kind in ('CODE', 'EXACT', 'ALIAS') and v_n = 1 then 'UPDATE' else 'REVIEW' end));
  end loop;
  return jsonb_build_object(
    'job_status', j.status,
    'total', (select count(*) from import_job_rows where job_id = p_job),
    'ready', (select count(*) from import_job_rows where job_id = p_job and applied_id is null and apply_action = 'SKIPPED' and status in ('NEW', 'UPDATED')),
    'ready_create', (select count(*) from import_job_rows where job_id = p_job and applied_id is null and apply_action = 'SKIPPED' and status = 'NEW'),
    'ready_update', (select count(*) from import_job_rows where job_id = p_job and applied_id is null and apply_action = 'SKIPPED' and status = 'UPDATED'),
    'unresolved_units', (select count(*) from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW' and review_code = 'UNIT_UNKNOWN' and decision is null),
    'needs_decision', (select count(*) from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW' and decision is null and review_code is distinct from 'UNIT_UNKNOWN'),
    'skipped_by_decision', (select count(*) from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW' and decision is not null),
    'errors', (select count(*) from import_job_rows where job_id = p_job and (status = 'ERROR' or apply_action = 'ERROR')),
    'already_applied', (select count(*) from import_job_rows where job_id = p_job and apply_action in ('CREATED', 'UPDATED') and reapplied_at is null),
    'completed_now', (select count(*) from import_job_rows where job_id = p_job and apply_action in ('CREATED', 'UPDATED') and reapplied_at is not null),
    'unchanged_after', (select count(*) from import_job_rows where job_id = p_job and reapplied_at is not null and status = 'UNCHANGED'),
    'unresolved_names', coalesce((select jsonb_agg(jsonb_build_object('kind', x.kind, 'name', x.name, 'rows', x.n) order by x.n desc, x.name)
        from (select case when m ~ '^Подразделение' then 'DEPARTMENT' else 'UNIT' end as kind, (regexp_match(m, '^(?:Подразделение|Отдел) «(.*)» не найден(?:о)?$'))[1] as name, count(*) as n
                from import_job_rows jr, unnest(jr.messages) m
               where jr.job_id = p_job and jr.status = 'NEEDS_REVIEW' and jr.review_code = 'UNIT_UNKNOWN' and jr.decision is null and m ~ '^(?:Подразделение|Отдел) «.*» не найден(?:о)?$'
               group by 1, 2 order by 3 desc, 2 limit 20) x), '[]'::jsonb),
    'sample', v_sample);
end $$;

-- ---------- 3. Применение разрешённых строк (пакет) ----------
-- Явное подтверждение пользователя — причина (обязательна в каждом вызове). Курсор p_after (row_no) даёт прогресс без повторного обхода;
-- повтор с p_after = 0 безопасен: применённые строки в выборку не попадают. Строки, которые не удалось применить (apply_action = 'ERROR'
-- с reapplied_at), повторно берутся при следующем запуске с p_after = 0.
create function import_apply_resolved_batch(p_job uuid, p_limit integer default 100, p_after integer default 0, p_reason text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; r import_job_rows%rowtype; v_reason text; v_emp uuid; v_id uuid; v_action text; v_patch jsonb; c jsonb; v_best text; v_n int;
        d jsonb; e employees%rowtype; x record; v_name text; v_code text;
        v_created int := 0; v_updated int := 0; v_unch int := 0; v_review int := 0; v_err int := 0; v_done int := 0; v_last int := coalesce(p_after, 0); v_remaining int;
begin
  if p_limit is null or p_limit < 1 or p_limit > 300 then raise exception 'Размер пакета от 1 до 300' using errcode = 'P0015'; end if;
  v_reason := req_reason(p_reason);
  select * into j from import_jobs where id = p_job for update;     -- последовательность пакетов и защита от гонки с другими разборами
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Дозавершение доступно только для импорта сотрудников' using errcode = 'P0015'; end if;
  if j.status <> 'COMMITTED' then raise exception 'Дозавершение доступно только для применённого импорта' using errcode = 'P0015'; end if;
  v_reason := 'Дозавершение импорта «' || left(j.file_name, 120) || '»: ' || v_reason;
  perform set_config('app.change_reason', v_reason, true);
  for r in select * from import_job_rows
            where job_id = p_job and row_no > coalesce(p_after, 0) and applied_id is null and status in ('NEW', 'UPDATED')
              and (apply_action = 'SKIPPED' or (apply_action = 'ERROR' and reapplied_at is not null))
            order by row_no limit p_limit loop
    v_last := r.row_no; v_done := v_done + 1;
    begin
      d := r.data;
      v_name := trim(coalesce(d->>'full_name', '')); v_code := nullif(trim(coalesce(d->>'employee_code', '')), '');
      if v_name = '' then raise exception 'Не указано ФИО' using errcode = 'P0015'; end if;
      -- повторное сопоставление: состояние справочника могло измениться с момента загрузки
      c := import_match_employees_fast(v_name, v_code);
      select c2->>'match_kind', count(*) into v_best, v_n from jsonb_array_elements(c) c2 group by 1
       order by min(case c2->>'match_kind' when 'CODE' then 1 when 'EXACT' then 2 when 'ALIAS' then 3 when 'REORDERED' then 4 else 5 end) limit 1;
      v_emp := null;
      if jsonb_array_length(c) = 0 then v_emp := null;
      elsif v_best in ('CODE', 'EXACT', 'ALIAS') and v_n = 1 then v_emp := (select (c2->>'employee_id')::uuid from jsonb_array_elements(c) c2 where c2->>'match_kind' = v_best limit 1);
      else
        -- неоднозначно: не создаём и не обновляем, возвращаем на ручную проверку (счётчик «требует решения»)
        update import_job_rows set status = 'NEEDS_REVIEW', review_code = case when v_best in ('CODE', 'EXACT', 'ALIAS') then 'EMPLOYEE_AMBIGUOUS' else 'EMPLOYEE_FUZZY' end,
               messages = messages || array[case when v_n > 1 then 'Найдено несколько сотрудников' else 'Совпадение неточное: проверьте сотрудника' end],
               candidates = (select coalesce(jsonb_agg(jsonb_build_object('employee_id', m.employee_id, 'full_name', m.full_name, 'match_kind', m.match_kind,
                                'position', m."position", 'is_active', m.is_active)), '[]'::jsonb) from match_employee_candidates(v_name, v_code, false) m)
         where id = r.id;
        perform import_dq_sync(p_job, r.id, case when v_best in ('CODE', 'EXACT', 'ALIAS') then 'EMPLOYEE_AMBIGUOUS' else 'EMPLOYEE_FUZZY' end,
          'Импорт «' || j.file_name || '», строка ' || r.row_no || ': требуется решение по сотруднику', true);
        v_review := v_review + 1;
        continue;
      end if;
      if v_code is not null and exists (select 1 from employees where lower(employee_code) = lower(v_code) and id is distinct from v_emp) then
        raise exception 'Табельный номер % уже принадлежит другому сотруднику', v_code using errcode = 'P0015'; end if;

      if v_emp is null then
        v_id := create_employee(d, v_reason); v_action := 'CREATED';
      else
        select * into e from employees where id = v_emp;
        select email, phone into x from employee_contacts where employee_id = v_emp;
        if (d->>'full_name') is not distinct from e.full_name
           and (not d ? 'employee_code' or d->>'employee_code' is null or d->>'employee_code' is not distinct from e.employee_code)
           and (not d ? 'position' or d->>'position' is not distinct from e."position")
           and (not d ? 'department_id' or (d->>'department_id')::bigint is not distinct from e.department_id)
           and (not d ? 'unit_id' or (d->>'unit_id')::bigint is not distinct from e.unit_id)
           and (not d ? 'hire_date' or (d->>'hire_date')::date is not distinct from e.hire_date)
           and (not d ? 'termination_date' or (d->>'termination_date')::date is not distinct from e.termination_date)
           and (not d ? 'is_active' or (d->>'is_active')::boolean is not distinct from e.is_active)
           and (not d ? 'email' or d->>'email' is not distinct from x.email)
           and (not d ? 'phone' or d->>'phone' is not distinct from x.phone) then
          update import_job_rows set status = 'UNCHANGED', match_id = v_emp, reapplied_at = now(), reapplied_by = auth.uid(), apply_error = null,
                 messages = messages || array['Сотрудник уже в справочнике без отличий'] where id = r.id;
          perform import_dq_sync(p_job, r.id, null, null, false);
          v_unch := v_unch + 1;
          continue;
        end if;
        v_patch := d - 'full_name' - 'employee_code' || jsonb_build_object('full_name', d->>'full_name');
        if (d->>'employee_code') is not null then v_patch := v_patch || jsonb_build_object('employee_code', d->>'employee_code'); end if;
        perform update_employee(v_emp, v_patch, v_reason); v_id := v_emp; v_action := 'UPDATED';
      end if;
      perform import_lineage(p_job, r.row_no, md5(r.raw::text), 'employees', v_id);
      update import_job_rows set applied_id = v_id, apply_action = v_action, apply_error = null, match_id = case when v_action = 'UPDATED' then v_id else match_id end,
             reapplied_at = now(), reapplied_by = auth.uid() where id = r.id;
      perform import_dq_sync(p_job, r.id, null, null, false);
      if v_action = 'CREATED' then v_created := v_created + 1; else v_updated := v_updated + 1; end if;
    exception
      -- таймаут, отмена, блокировка: пакет откатывается целиком (строки не отмечены), повтор безопасен
      when query_canceled or lock_not_available or deadlock_detected then raise;
      -- ошибка одной строки: строка помечается (изменения строки откатились вместе с подтранзакцией), пакет продолжается
      when others then
        update import_job_rows set apply_action = 'ERROR', apply_error = left(sqlerrm, 500), reapplied_at = now(), reapplied_by = auth.uid() where id = r.id;
        v_err := v_err + 1;
    end;
  end loop;
  perform import_job_recount(p_job);
  select count(*) into v_remaining from import_job_rows
   where job_id = p_job and row_no > v_last and applied_id is null and status in ('NEW', 'UPDATED')
     and (apply_action = 'SKIPPED' or (apply_action = 'ERROR' and reapplied_at is not null));
  return jsonb_build_object('processed', v_done, 'created', v_created, 'updated', v_updated, 'unchanged', v_unch, 'needs_review', v_review, 'errors', v_err,
                            'next_after', v_last, 'remaining', v_remaining, 'done', v_remaining = 0);
end $$;

do $$ declare f text; begin
  foreach f in array array['import_match_employees_fast(text, text)', 'import_job_recount(uuid)', 'import_reanalyze_job(uuid, integer, bigint)',
                           'import_resolved_preview(uuid)', 'import_apply_resolved_batch(uuid, integer, integer, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
