-- HOTFIX · M23 — пакетная (по частям) загрузка строк импорта.
-- Причина: мастер отправлял все строки (raw + data) одним Server Action; для ~2600 сотрудников это > 1 МБ (лимит Server Actions) → 413.
-- Кроме того, import_stage анализирует все строки одной транзакцией: на больших списках это упирается в statement_timeout роли authenticated.
-- Решение: задание создаётся в статусе STAGING, строки добавляются частями (каждая часть — отдельная короткая транзакция, повтор безопасен),
-- finish один раз находит повторы внутри файла, считает итоги и переводит задание в STAGED. Анализ строки — тот же import_analyze_row.
-- Аддитивно: import_stage, import_commit и остальные функции прежних фаз не меняются (commit/resolve/cancel требуют STAGED — задание STAGING применить нельзя).

do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'import_jobs'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%STAGED%' loop
    execute format('alter table import_jobs drop constraint %I', c);
  end loop;
end $$;
alter table import_jobs add constraint import_jobs_status_check check (status in ('STAGING','STAGED','COMMITTED','CANCELLED','FAILED'));
alter table import_job_rows add column dup_key text;

-- Ключ повтора внутри файла — та же формула, что в import_stage.
create function import_row_key(p_entity text, p_data jsonb, p_analyzed jsonb) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p_entity in ('EMPLOYEES','PARTICIPANTS') then coalesce(nullif(lower(trim(p_data->>'employee_code')), ''), norm_name(p_data->>'full_name'))
              else md5(p_analyzed::text) end
$$;

create function import_stage_begin(p_entity text, p_source text, p_file_name text, p_file_hash text, p_mapping jsonb, p_options jsonb, p_total integer, p_token uuid)
returns uuid language plpgsql set search_path = public, pg_temp as $$
declare v_job uuid;
begin
  if not can_import(p_entity) then raise exception 'Недостаточно прав для импорта «%»', p_entity using errcode = '42501'; end if;
  if p_token is null then raise exception 'Не указан идентификатор загрузки' using errcode = 'P0015'; end if;
  if p_total is null or p_total < 1 then raise exception 'В файле нет строк' using errcode = 'P0015'; end if;
  if p_total > 5000 then raise exception 'Не больше 5000 строк за раз' using errcode = 'P0015'; end if;
  -- повтор begin с тем же токеном возвращает то же задание (сетевой повтор не создаёт второе)
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
declare j import_jobs%rowtype; r jsonb; a jsonb; v_id bigint; v_added integer := 0; v_skipped integer := 0; v_have integer; v_expected integer; v_no integer;
begin
  select * into j from import_jobs where id = p_job for update;
  if not found or j.created_by is distinct from auth.uid() or not can_import(j.entity) then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if j.status <> 'STAGING' then raise exception 'Загрузка этого импорта уже завершена' using errcode = 'P0015'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'Пустая часть' using errcode = 'P0015'; end if;
  if jsonb_array_length(p_rows) > 1000 then raise exception 'Не больше 1000 строк в одной части' using errcode = 'P0015'; end if;
  v_expected := (j.options->>'expected_rows')::int;
  perform set_config('app.change_reason', 'Импорт: ' || j.file_name, true);
  for r in select * from jsonb_array_elements(p_rows) loop
    v_no := (r->>'row_no')::int;
    if v_no is null or v_no < 1 then raise exception 'Неверный номер строки' using errcode = 'P0015'; end if;
    if exists (select 1 from import_job_rows where job_id = p_job and row_no = v_no) then v_skipped := v_skipped + 1; continue; end if; -- повтор части
    select count(*)::int into v_have from import_job_rows where job_id = p_job;
    if v_have >= v_expected then raise exception 'Строк больше заявленного (%)', v_expected using errcode = 'P0015'; end if;
    a := import_analyze_row(j.entity, r->'data', coalesce(j.options, '{}'));
    insert into import_job_rows(job_id, row_no, raw, data, status, match_id, candidates, messages, review_code, dup_key)
    values (p_job, v_no, coalesce(r->'raw', r->'data'), coalesce(a->'data', '{}'), a->>'status', nullif(a->>'match_id','')::uuid, a->'candidates',
            coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(a->'messages','[]')) x), '{}'), a->>'review_code',
            import_row_key(j.entity, r->'data', a->'data'));
    v_added := v_added + 1;
  end loop;
  select count(*)::int into v_have from import_job_rows where job_id = p_job;
  return jsonb_build_object('added', v_added, 'skipped', v_skipped, 'received', v_have, 'expected', v_expected);
end $$;

create function import_stage_finish(p_job uuid) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare j import_jobs%rowtype; v_have integer; v_expected integer; r record;
begin
  select * into j from import_jobs where id = p_job for update;
  if not found or j.created_by is distinct from auth.uid() or not can_import(j.entity) then raise exception 'Импорт не найден' using errcode = 'P0015'; end if;
  if j.status = 'STAGED' then return p_job; end if; -- повтор finish
  if j.status <> 'STAGING' then raise exception 'Загрузка этого импорта уже завершена' using errcode = 'P0015'; end if;
  v_expected := (j.options->>'expected_rows')::int;
  select count(*)::int into v_have from import_job_rows where job_id = p_job;
  if v_have <> v_expected then raise exception 'Загружено % из % строк — повторите загрузку', v_have, v_expected using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', 'Импорт: ' || j.file_name, true);
  -- повтор внутри файла: любая более ранняя строка с тем же ключом (как в import_stage); строки с ошибкой повторами не считаются
  update import_job_rows t set status = 'DUPLICATE', messages = t.messages || array['Повтор в этом файле']
   where t.job_id = p_job and t.status <> 'ERROR' and t.dup_key is not null
     and exists (select 1 from import_job_rows e where e.job_id = p_job and e.dup_key = t.dup_key and e.row_no < t.row_no);
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

-- Прерванная загрузка: задание отменяется, строки остаются для разбора, справочники не затронуты.
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

do $$ declare f text; begin
  foreach f in array array['import_row_key(text, jsonb, jsonb)', 'import_stage_begin(text, text, text, text, jsonb, jsonb, integer, uuid)', 'import_stage_append(uuid, jsonb)',
                           'import_stage_finish(uuid)', 'import_stage_abort(uuid)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
