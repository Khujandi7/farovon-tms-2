-- HOTFIX · M23 — пакетные загрузка и применение импорта сотрудников (обход 413 и таймаута 8 с).
--
-- Причины:
--  (1) 413: мастер отправлял все строки (2646 сотрудников, raw + data) одним Server Action; тело > 1 МБ.
--  (2) Таймаут: import_stage и import_commit работают одной транзакцией/оператором. Замер (локально, 2646 строк):
--      import_commit ≈ 26 с при лимите authenticated 8 с; import_stage по частям — < 1 с на 300 строк.
--
-- Решение (всё новое, существующие функции прежних фаз не переопределяются):
--  • Загрузка: import_stage_begin / import_stage_append (части по ≤ 1000 строк, повтор части безопасен) / import_stage_finish.
--    Токен загрузки (client_token) делает повтор begin идемпотентным.
--  • Применение: import_commit_batch(p_job, p_limit, p_reason) — применяет следующие p_limit необработанных строк.
--    Каждая строка обрабатывается в собственном savepoint; строка с ошибкой помечается apply_action='ERROR' и не останавливает пакет.
--    Таймаут/блокировка/дедлок пробрасываются наружу — тогда откатывается весь пакет и ничего не отмечается (повтор безопасен).
--    Отметка processed_at и результат строки пишутся в той же транзакции, что и изменения справочника:
--    уже обработанная строка повторно не применяется. Счётчики пересчитываются из строк (apply_action), а не накапливаются.
--    Статус задания: STAGED → COMMITTING (после первого пакета) → COMMITTED (когда необработанных строк не осталось).
--    Повтор вызова после COMMITTED ничего не меняет и возвращает итог.
--  • Правила сопоставления, ручной проверки, защита от дубликатов, RLS и роли — прежние (can_import, import_analyze_row, create/update_employee).
--    Пакетное применение пока только для сотрудников; остальные сущности применяются через import_commit, как раньше.

-- ========== 1. Статусы и колонки прогресса ==========
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'import_jobs'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%STAGED%' loop
    execute format('alter table import_jobs drop constraint %I', c);
  end loop;
end $$;
alter table import_jobs add constraint import_jobs_status_check check (status in ('STAGING','STAGED','COMMITTING','COMMITTED','CANCELLED','FAILED'));
alter table import_jobs add column apply_errors integer not null default 0;
alter table import_job_rows add column dup_key text;
alter table import_job_rows add column processed_at timestamptz;
alter table import_job_rows add column apply_action text check (apply_action in ('CREATED','UPDATED','SKIPPED','ERROR'));
alter table import_job_rows add column apply_error text;
create index import_job_rows_pending_idx on import_job_rows (job_id, row_no) where processed_at is null;
create index import_job_rows_dup_key_idx on import_job_rows (job_id, dup_key) where dup_key is not null;

-- ========== 2. Пакетная загрузка ==========
-- Ключ повтора внутри файла — та же формула, что в import_stage.
create function import_row_key(p_entity text, p_data jsonb, p_analyzed jsonb) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p_entity in ('EMPLOYEES','PARTICIPANTS') then coalesce(nullif(lower(trim(p_data->>'employee_code')), ''), norm_name(p_data->>'full_name'))
              else md5(p_analyzed::text) end
$$;

-- Анализ строки для пакетной загрузки. Почему SECURITY DEFINER: под RLS политика employees (app_role() = ANY …) не даёт
-- планировщику использовать индексы по ФИО/коду, и сопоставление сканирует весь справочник на каждой строке.
-- Замер (2646 сотрудников): ~90 мс на строку под RLS против ~2,5 мс без него; часть из 300 строк заняла бы ~30 с при лимите 8 с.
-- Безопасность: функция сама требует can_import(p_entity) (те же роли, что import_stage), возвращает тот же результат,
-- что import_analyze_row для этих ролей (они и так читают справочник сотрудников). Политики RLS не меняются.
create function import_analyze_row_fast(p_entity text, p_in jsonb, p_options jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not can_import(p_entity) then raise exception 'Недостаточно прав для импорта «%»', p_entity using errcode = '42501'; end if;
  return import_analyze_row(p_entity, p_in, p_options);
end $$;

create function import_stage_begin(p_entity text, p_source text, p_file_name text, p_file_hash text, p_mapping jsonb, p_options jsonb, p_total integer, p_token uuid)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_job uuid;
begin
  if not can_import(p_entity) then raise exception 'Недостаточно прав для импорта «%»', p_entity using errcode = '42501'; end if;
  if p_token is null then raise exception 'Не указан идентификатор загрузки' using errcode = 'P0015'; end if;
  if p_total is null or p_total < 1 then raise exception 'В файле нет строк' using errcode = 'P0015'; end if;
  if p_total > 5000 then raise exception 'Не больше 5000 строк за раз' using errcode = 'P0015'; end if;
  select id into v_job from import_jobs where created_by = auth.uid() and options->>'client_token' = p_token::text;
  if found then return v_job; end if;
  perform set_config('app.change_reason', 'Импорт: ' || p_file_name, true);
  insert into import_jobs(entity, source, file_name, file_hash, status, mapping, options)
  values (p_entity, p_source, left(p_file_name, 200), p_file_hash, 'STAGING', coalesce(p_mapping, '{}'),
          coalesce(p_options, '{}') || jsonb_build_object('client_token', p_token::text, 'expected_rows', p_total))
  returning id into v_job;
  return v_job;
end $$;

create function import_stage_append(p_job uuid, p_rows jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; r jsonb; a jsonb; v_added integer := 0; v_skipped integer := 0; v_have integer; v_expected integer; v_no integer;
begin
  select * into j from import_jobs where id = p_job for update;
  if not found or j.created_by is distinct from auth.uid() or not can_import(j.entity) then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if j.status <> 'STAGING' then raise exception 'Загрузка этого импорта уже завершена' using errcode = 'P0015'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Пустая часть' using errcode = 'P0015'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'Не больше 1000 строк в одной части' using errcode = 'P0015'; end if;
  v_expected := (j.options->>'expected_rows')::int;
  select count(*)::int into v_have from import_job_rows where job_id = p_job;  -- один раз; дальше счётчик ведётся в цикле
  perform set_config('app.change_reason', 'Импорт: ' || j.file_name, true);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_no := (r->>'row_no')::int;
    if v_no is null or v_no < 1 then raise exception 'Неверный номер строки' using errcode = 'P0015'; end if;
    if exists (select 1 from import_job_rows where job_id = p_job and row_no = v_no) then v_skipped := v_skipped + 1; continue; end if; -- повтор части
    if v_have >= v_expected then raise exception 'Строк больше заявленного (%)', v_expected using errcode = 'P0015'; end if;
    a := import_analyze_row_fast(j.entity, r->'data', coalesce(j.options, '{}'));
    insert into import_job_rows(job_id, row_no, raw, data, status, match_id, candidates, messages, review_code, dup_key)
    values (p_job, v_no, coalesce(r->'raw', r->'data'), coalesce(a->'data', '{}'), a->>'status', nullif(a->>'match_id','')::uuid, a->'candidates',
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(a->'messages','[]')) x), '{}'), a->>'review_code',
            import_row_key(j.entity, r->'data', a->'data'));
    v_added := v_added + 1; v_have := v_have + 1;
  end loop;
  return jsonb_build_object('added', v_added, 'skipped', v_skipped, 'received', v_have, 'expected', v_expected);
end $$;

create function import_stage_finish(p_job uuid) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; v_have integer; v_expected integer; r record;
begin
  select * into j from import_jobs where id = p_job for update;
  if not found or j.created_by is distinct from auth.uid() or not can_import(j.entity) then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if j.status <> 'STAGING' then return p_job; end if; -- повтор finish: задание уже проанализировано
  v_expected := (j.options->>'expected_rows')::int;
  select count(*)::int into v_have from import_job_rows where job_id = p_job;
  if v_have <> v_expected then raise exception 'Загружено % из % строк — повторите загрузку', v_have, v_expected using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', 'Импорт: ' || j.file_name, true);
  -- повтор внутри файла (как в import_stage): раньше в файле есть строка с тем же ключом (любого статуса), сама строка — не ERROR.
  -- Один проход оконной функцией: без статистики и под RLS коррелированный EXISTS становится квадратичным.
  -- ВАЖНО: оконная выборка — materialized CTE. Как подзапрос в join без материализации она пересчитывается на каждую строку (квадрат).
  with d as materialized (
    select id from (select id, row_number() over (partition by dup_key order by row_no) rn
                      from import_job_rows where job_id = p_job and dup_key is not null) x
     where x.rn > 1)
  update import_job_rows set status = 'DUPLICATE', messages = messages || array['Повтор в этом файле']
   where job_id = p_job and status <> 'ERROR' and id in (select id from d);
  for r in select id, row_no, review_code, messages from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW' order by row_no loop
    perform import_dq_sync(p_job, r.id, r.review_code, 'Импорт «' || j.file_name || '», строка ' || r.row_no || ': ' || coalesce(r.messages[1], 'требуется решение'), true);
  end loop;
  update import_jobs x set status = 'STAGED', total_rows = c.t, new_rows = c.n, updated_rows = c.u, unchanged_rows = c.x, duplicate_rows = c.d, review_rows = c.r, error_rows = c.e
    from (select count(*) t, count(*) filter (where status='NEW') n, count(*) filter (where status='UPDATED') u,
                 count(*) filter (where status='UNCHANGED') x, count(*) filter (where status='DUPLICATE') d,
                 count(*) filter (where status='NEEDS_REVIEW') r, count(*) filter (where status='ERROR') e
            from import_job_rows where job_id = p_job) c where x.id = p_job;
  return p_job;
end $$;

create function import_stage_abort(p_job uuid) returns text
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype;
begin
  select * into j from import_jobs where id = p_job for update;
  if not found or j.created_by is distinct from auth.uid() or not can_import(j.entity) then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if j.status <> 'STAGING' then return j.status; end if;
  perform set_config('app.change_reason', 'Загрузка прервана', true);
  update import_jobs set status = 'CANCELLED', note = 'Загрузка прервана до завершения' where id = p_job;
  return 'CANCELLED';
end $$;

-- ========== 3. Пакетное применение (сотрудники) ==========
-- Возвращает прогресс; вызывается повторно, пока remaining > 0. Один вызов = одна транзакция (блокировка задания + пакет).
create function import_commit_batch(p_job uuid, p_limit integer default 120, p_reason text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; r import_job_rows%rowtype; v_reason text; v_done integer := 0; v_remaining integer; v_emp uuid; v_id uuid;
        v_action text; v_hash text; v_patch jsonb; v_total integer;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then raise exception 'Размер пакета от 1 до 500' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = p_job for update;   -- последовательность пакетов: блокировка задания
  if not found then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.entity <> 'EMPLOYEES' then raise exception 'Пакетное применение доступно для справочника сотрудников' using errcode = 'P0015'; end if;
  if j.status = 'STAGED' then
    if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'Укажите причину применения' using errcode = 'P0015'; end if;
    update import_jobs set status = 'COMMITTING', options = options || jsonb_build_object('commit_reason', trim(p_reason)) where id = p_job;
    select * into j from import_jobs where id = p_job;
  elsif j.status = 'COMMITTED' then
    -- повтор после завершения: ничего не меняем, отдаём итог
  elsif j.status <> 'COMMITTING' then
    raise exception 'Импорт уже выполнен или отменён' using errcode = 'P0015';
  end if;

  if j.status = 'COMMITTING' then
    v_reason := coalesce(nullif(trim(coalesce(j.options->>'commit_reason', '')), ''), 'Импорт: ' || j.file_name);
    perform set_config('app.change_reason', v_reason, true);
    for r in select * from import_job_rows where job_id = p_job and processed_at is null order by row_no limit p_limit loop
      begin
        if r.status in ('UNCHANGED','DUPLICATE','ERROR') or (r.status = 'NEEDS_REVIEW' and coalesce(r.decision, 'SKIP') = 'SKIP') then
          v_action := 'SKIPPED'; v_id := null;
        else
          v_emp := coalesce(case when r.decision = 'MATCH' then r.decision_match end, r.match_id);
          v_hash := md5(r.raw::text);
          if v_emp is null then
            v_id := create_employee(r.data, v_reason); v_action := 'CREATED';
          else
            v_patch := r.data - 'full_name' - 'employee_code' || jsonb_build_object('full_name', r.data->>'full_name');
            if (r.data->>'employee_code') is not null then v_patch := v_patch || jsonb_build_object('employee_code', r.data->>'employee_code'); end if;
            perform update_employee(v_emp, v_patch, v_reason); v_id := v_emp; v_action := 'UPDATED';
          end if;
          if v_action in ('CREATED','UPDATED') then
            perform import_lineage(p_job, r.row_no, v_hash, 'employees', v_id);
            update import_job_rows set applied_id = v_id where id = r.id;
            perform import_dq_sync(p_job, r.id, null, null, false);
          end if;
        end if;
        update import_job_rows set processed_at = now(), apply_action = v_action, apply_error = null where id = r.id;
      exception
        -- таймаут, отмена или блокировка: пакет целиком откатывается, ни одна строка не отмечена — повтор безопасен
        when query_canceled or lock_not_available or deadlock_detected then raise;
        -- ошибка одной строки: строка помечается, пакет продолжается
        when others then
          update import_job_rows set processed_at = now(), apply_action = 'ERROR', apply_error = left(sqlerrm, 500) where id = r.id;
      end;
      v_done := v_done + 1;
    end loop;
  end if;

  select count(*) into v_remaining from import_job_rows where job_id = p_job and processed_at is null;
  select count(*) into v_total from import_job_rows where job_id = p_job;
  if j.status = 'COMMITTING' and v_remaining = 0 then
    update import_jobs set status = 'COMMITTED', committed_at = now(), committed_by = auth.uid() where id = p_job;
  end if;
  update import_jobs set
      inserted = (select count(*) from import_job_rows where job_id = p_job and apply_action = 'CREATED'),
      updated = (select count(*) from import_job_rows where job_id = p_job and apply_action = 'UPDATED'),
      skipped = (select count(*) from import_job_rows where job_id = p_job and apply_action = 'SKIPPED'),
      apply_errors = (select count(*) from import_job_rows where job_id = p_job and apply_action = 'ERROR'),
      conflicts = (select count(*) from import_job_rows where job_id = p_job and status = 'NEEDS_REVIEW')
    where id = p_job;
  select * into j from import_jobs where id = p_job;
  return jsonb_build_object('status', j.status, 'processed_now', v_done, 'remaining', v_remaining, 'total', v_total,
                            'inserted', j.inserted, 'updated', j.updated, 'skipped', j.skipped, 'apply_errors', j.apply_errors);
end $$;

do $$ declare f text; begin
  foreach f in array array['import_row_key(text, jsonb, jsonb)', 'import_analyze_row_fast(text, jsonb, jsonb)', 'import_stage_begin(text, text, text, text, jsonb, jsonb, integer, uuid)', 'import_stage_append(uuid, jsonb)',
                           'import_stage_finish(uuid)', 'import_stage_abort(uuid)', 'import_commit_batch(uuid, integer, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
