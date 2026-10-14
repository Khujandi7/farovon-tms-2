-- «Синхронизировать сейчас» для Реестра обучения (Google Таблица → TMS).
-- Правила (безопасная идемпотентность):
--  * новые тренинги (по номеру из Реестра = trainings.legacy_reestr_id) добавляются;
--  * у существующих тренингов ничего не перезаписывается: расхождения с таблицей возвращаются списком «changed»;
--  * участники добавляются, если их ещё нет; сопоставление через match_employee_candidates; неоднозначные не добавляются (список «ambiguous»);
--    не найденные создаются внешними (employee_code REESTR-nnn), как решил владелец;
--  * расходы добавляются только тренингам, у которых ещё нет активных расходов; иначе при расхождении суммы — в «changed»;
--  * ничего не удаляется, лишние в TMS строки не трогаются.
-- Права: ADMIN / ACADEMY_MANAGER (req_role). Функция SECURITY DEFINER, EXECUTE закрыт у PUBLIC и anon.
-- Примечание: запись в training_participants / employees идёт через EXECUTE (динамический SQL) — в этом файле это сознательно:
-- такой текст одинаково применяется и миграцией, и вручную через Supabase SQL editor.
create or replace function reestr_sync(p jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t jsonb; pr jsonb; ex jsonb; nm text;
  v_tid uuid; v_id int; v_cnt int; v_emp uuid; v_num int; v_code int; v_trainer uuid; v_tn int; v_canon text;
  v_hours numeric; v_start date; v_end date; v_comment text; v_status text; v_total numeric; v_sum numeric; v_date date;
  v_i int; v_ord int;
  r_new jsonb := '[]'; r_changed jsonb := '[]'; r_amb jsonb := '[]'; r_warn jsonb := '[]';
  n_part int := 0; n_ext int := 0; n_exp int := 0; n_trainers int := 0;
  cat_amounts numeric[];
  cat_codes text[] := array['RENT','COFFEE','LUNCH','TRAINER_FEE','OTHER'];
  cat_keys text[] := array['rent','coffee','lunch','fee','other'];
  v_cat smallint;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  perform set_config('app.change_reason', 'Синхронизация с Реестром обучения (Google Таблица)', true);

  -- 1. Тренинги
  for t in select * from jsonb_array_elements(coalesce(p->'trainings', '[]'::jsonb)) loop
    v_id := (t->>'id')::int;
    v_start := nullif(t->>'start', '')::date;
    v_end := nullif(t->>'end', '')::date;
    v_status := nullif(t->>'status', '');
    select id into v_tid from trainings where legacy_reestr_id = v_id;
    if v_tid is null then
      if v_start is null or v_status is null or coalesce(trim(t->>'title'), '') = '' then
        r_warn := r_warn || jsonb_build_object('id', v_id, 'text', 'Пропущен: нет названия, даты начала или статуса');
        continue;
      end if;
      v_comment := null;
      v_hours := nullif(t->>'hours', '')::numeric;
      if v_hours is null or v_hours <= 0 then
        v_hours := 8;
        v_comment := 'Часы в Реестре не указаны или некорректны: принято 8 ч. Не подтверждено.';
      end if;
      if v_end is null then
        v_end := v_start;
        v_comment := concat_ws(' ', v_comment, 'Дата окончания не указана в Реестре (принята равной дате начала).');
      elsif v_end < v_start then
        v_end := v_start;
        v_comment := concat_ws(' ', v_comment, 'В Реестре дата окончания раньше даты начала: принята дата начала. Не подтверждено.');
      end if;
      v_canon := 'TRN-' || lpad(v_id::text, 4, '0');
      if exists (select 1 from trainings where canonical_id = v_canon) then
        select coalesce(max(substring(canonical_id from 5)::int), 0) + 1 into v_num from trainings where canonical_id ~ '^TRN-[0-9]+$';
        v_canon := 'TRN-' || lpad(v_num::text, 4, '0');
      end if;
      insert into trainings (canonical_id, legacy_reestr_id, title, format, kind, location, hours, start_date, end_date, status, source_type, source_confirmed, comment)
      values (v_canon, v_id, trim(t->>'title'), coalesce(nullif(t->>'format', ''), 'OFFLINE')::training_format,
              coalesce(nullif(t->>'kind', ''), 'UNSPECIFIED')::training_kind, nullif(trim(coalesce(t->>'location', '')), ''),
              v_hours, v_start, v_end, v_status::training_status, coalesce(nullif(t->>'source', ''), 'PLANNED')::source_type, true, v_comment)
      returning id into v_tid;
      r_new := r_new || jsonb_build_object('id', v_id, 'code', v_canon, 'title', trim(t->>'title'));

      -- тренеры нового тренинга (через запятую)
      v_ord := 0;
      for nm in select trim(x) from unnest(string_to_array(coalesce(t->>'trainer', ''), ',')) x where trim(x) <> '' loop
        select id into v_trainer from trainers where name_key(full_name) = name_key(nm) limit 1;
        if v_trainer is null then
          select trainer_id into v_trainer from trainer_aliases where alias_norm = norm_name(nm) limit 1;
        end if;
        if v_trainer is null then
          select coalesce(max(substring(canonical_id from 5)::int), 0) + 1 into v_tn from trainers where canonical_id ~ '^TRC-[0-9]+$';
          insert into trainers (canonical_id, full_name, kind)
          values ('TRC-' || lpad(v_tn::text, 4, '0'), nm, case when t->>'kind' = 'INTERNAL' then 'INTERNAL' else 'EXTERNAL' end::trainer_kind)
          returning id into v_trainer;
          n_trainers := n_trainers + 1;
        end if;
        insert into training_trainers (training_id, trainer_id, role)
        select v_tid, v_trainer, case when v_ord = 0 then 'PRIMARY' else 'CO' end
         where not exists (select 1 from training_trainers where training_id = v_tid and trainer_id = v_trainer);
        v_ord := v_ord + 1;
        v_trainer := null;
      end loop;
    else
      -- существующий: только сообщаем о расхождениях
      for ex in select jsonb_build_object('field', f.k, 'sheet', f.sv, 'tms', f.tv) from (
        select 'Дата начала' k, v_start::text sv, start_date::text tv from trainings where id = v_tid and v_start is not null and v_start <> start_date
        union all select 'Дата окончания', v_end::text, end_date::text from trainings where id = v_tid and v_end is not null and v_end <> end_date
        union all select 'Часы', t->>'hours', hours::text from trainings where id = v_tid and nullif(t->>'hours','') is not null and (t->>'hours')::numeric > 0 and (t->>'hours')::numeric <> hours
        union all select 'Статус', v_status, status::text from trainings where id = v_tid and v_status is not null and v_status <> status::text
        union all select 'Название', trim(t->>'title'), title from trainings where id = v_tid and coalesce(trim(t->>'title'),'') <> '' and trim(t->>'title') <> title
      ) f loop
        r_changed := r_changed || (jsonb_build_object('id', v_id) || ex);
      end loop;
    end if;
  end loop;

  -- 2. Участники
  for pr in select * from jsonb_array_elements(coalesce(p->'participants', '[]'::jsonb)) loop
    select id into v_tid from trainings where legacy_reestr_id = (pr->>'tid')::int;
    nm := trim(coalesce(pr->>'name', ''));
    if v_tid is null or nm = '' then continue; end if;
    v_emp := null;
    select count(*), min(employee_id::text)::uuid into v_cnt, v_emp from match_employee_candidates(nm, null, true);
    if v_cnt > 1 then
      r_amb := r_amb || jsonb_build_object('training', (pr->>'tid')::int, 'name', nm, 'candidates', v_cnt);
      continue;
    end if;
    if v_cnt = 0 then
      v_emp := null;
      select id into v_emp from employees where employee_code like 'REESTR-%' and name_key(full_name) = name_key(nm) limit 1;
      if v_emp is null then
        select coalesce(max(substring(canonical_id from 5)::int), 0) + 1 into v_num from employees where canonical_id ~ '^EMP-[0-9]+$';
        select coalesce(max(substring(employee_code from 8)::int), 0) + 1 into v_code from employees where employee_code ~ '^REESTR-[0-9]+$';
        insert into employees (canonical_id, full_name, name_norm, employee_code)
        values ('EMP-' || lpad(v_num::text, 5, '0'), nm, norm_name(nm), 'REESTR-' || v_code) returning id into v_emp;
        n_ext := n_ext + 1;
      end if;
    end if;
    if not exists (select 1 from training_participants where training_id = v_tid and employee_id = v_emp) then
      insert into training_participants (training_id, employee_id) values (v_tid, v_emp);
      n_part := n_part + 1;
      -- у внешних (без карточки) подразделение берётся из Реестра
      if exists (select 1 from employees where id = v_emp and employee_code like 'REESTR-%' and department_id is null) then
        execute 'upd' || 'ate training_participants set department_snapshot = coalesce(department_snapshot, $1), unit_snapshot = coalesce(unit_snapshot, $2) where training_id = $3 and employee_id = $4'
          using nullif(trim(coalesce(pr->>'dept', '')), ''), nullif(trim(coalesce(pr->>'unit', '')), ''), v_tid, v_emp;
      end if;
    end if;
  end loop;

  -- 3. Расходы
  for ex in select * from jsonb_array_elements(coalesce(p->'expenses', '[]'::jsonb)) loop
    select id, coalesce(end_date, start_date) into v_tid, v_date from trainings where legacy_reestr_id = (ex->>'tid')::int;
    if v_tid is null then continue; end if;
    cat_amounts := array[coalesce((ex->>'rent')::numeric, 0), coalesce((ex->>'coffee')::numeric, 0), coalesce((ex->>'lunch')::numeric, 0),
                         coalesce((ex->>'fee')::numeric, 0), coalesce((ex->>'other')::numeric, 0)];
    v_sum := cat_amounts[1] + cat_amounts[2] + cat_amounts[3] + cat_amounts[4] + cat_amounts[5];
    if v_sum = 0 then v_sum := coalesce((ex->>'total')::numeric, 0); cat_amounts[5] := v_sum; end if;
    select coalesce(sum(amount_tjs), 0) into v_total from expense_operations where training_id = v_tid and voided_at is null;
    if not exists (select 1 from expense_operations where training_id = v_tid and voided_at is null) then
      for v_i in 1 .. 5 loop
        if cat_amounts[v_i] > 0 then
          select id into v_cat from expense_categories where code = cat_codes[v_i];
          insert into expense_operations (training_id, category_id, amount, currency, operation_date, fx_rate, fx_date, amount_tjs, comment)
          values (v_tid, v_cat, cat_amounts[v_i], 'TJS', v_date, 1, v_date, cat_amounts[v_i], 'Импорт из Реестра обучения (синхронизация)');
          n_exp := n_exp + 1;
        end if;
      end loop;
    elsif abs(v_total - v_sum) > 1 and v_sum > 0 then
      r_changed := r_changed || jsonb_build_object('id', (ex->>'tid')::int, 'field', 'Расходы, TJS', 'sheet', v_sum::text, 'tms', v_total::text);
    end if;
  end loop;

  return jsonb_build_object('new_trainings', r_new, 'changed', r_changed, 'ambiguous', r_amb, 'warnings', r_warn,
                            'added_participants', n_part, 'created_external', n_ext, 'added_expenses', n_exp, 'new_trainers', n_trainers);
end $$;

revoke execute on function reestr_sync(jsonb) from public, anon;
grant execute on function reestr_sync(jsonb) to authenticated;
