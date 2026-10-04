-- Миграция 0002: расчёты, триггеры, проверки. Все деньги считает БД.

-- ---------- Курс ----------
-- Курс на дату операции: берётся последний курс НЕ ПОЗЖЕ даты операции. Сегодняшний курс не используется.
create or replace function fx_rate_on(p_currency currency_code, p_date date)
returns table(rate numeric, rate_date date) language plpgsql stable as $$
begin
  if p_currency = 'TJS' then
    return query select 1::numeric, p_date;
    return;
  end if;
  return query
    select f.rate_to_tjs, f.rate_date from fx_rates f
    where f.currency = p_currency and f.rate_date <= p_date
    order by f.rate_date desc limit 1;
  if not found then
    raise exception 'Нет курса % на дату % (внесите курс в fx_rates)', p_currency, p_date
      using errcode = 'P0001';
  end if;
end $$;

create or replace function trg_expense_fx() returns trigger language plpgsql as $$
declare r record;
begin
  select * into r from fx_rate_on(new.currency, new.operation_date);
  new.fx_rate := r.rate;
  new.fx_date := r.rate_date;
  new.amount_tjs := round(new.amount * r.rate, 2);
  return new;
end $$;
create trigger expense_fx before insert or update of amount, currency, operation_date
  on expense_operations for each row execute function trg_expense_fx();

-- ---------- Показатели тренинга ----------
create or replace function actual_total(p_training uuid) returns numeric
language sql stable as $$
  select coalesce(sum(amount_tjs),0) from expense_operations where training_id = p_training
$$;

create or replace function participants_count(p_training uuid) returns integer
language sql stable as $$
  select count(*)::int from training_participants where training_id = p_training and attended
$$;

-- Человеко-часы: часы заходa участника (если заходов нет, часы тренинга)
create or replace function man_hours(p_training uuid) returns numeric
language sql stable as $$
  select coalesce(sum(coalesce(s.hours, t.hours)),0)
  from training_participants p
  join trainings t on t.id = p.training_id
  left join training_sessions s on s.id = p.session_id
  where p.training_id = p_training and p.attended
$$;

create or replace function cost_per_participant(p_training uuid) returns numeric
language sql stable as $$
  select case when participants_count(p_training) = 0 then null
              else round(actual_total(p_training) / participants_count(p_training), 2) end
$$;

create or replace function is_long_program(p_training uuid) returns boolean
language sql stable as $$
  select t.hours >= (select value::numeric from app_settings where key = 'long_program_hours')
  from trainings t where t.id = p_training
$$;

-- ---------- План ----------
create or replace function planned_total_usd(p_version bigint) returns numeric
language sql stable as $$
  select coalesce(sum(amount_usd),0) from budget_lines where version_id = p_version
$$;

-- План в сомони по бюджетному курсу. Нет курса: ошибка, а не курс 1.
create or replace function planned_total_tjs(p_version bigint) returns numeric
language plpgsql stable as $$
declare fx numeric;
begin
  select value::numeric into fx from app_settings where key = 'budget_fx_usd_tjs';
  if fx is null then
    raise exception 'Не задан бюджетный курс USD→TJS (app_settings.budget_fx_usd_tjs)';
  end if;
  return round(planned_total_usd(p_version) * fx, 2);
end $$;

-- Единая точка плана года: только APPROVED-версия
create or replace function approved_version(p_year smallint) returns bigint
language sql stable as $$
  select id from budget_versions where fiscal_year = p_year and status = 'APPROVED'
$$;

create or replace function variance_tjs(p_year smallint) returns numeric
language sql stable as $$
  select round(
    (select coalesce(sum(actual_total(t.id)),0) from trainings t
       where extract(year from t.start_date) = p_year and t.status in ('COMPLETED','IN_PROGRESS'))
    - planned_total_tjs(approved_version(p_year)), 2)
$$;

create or replace function saving_amount_tjs(p_year smallint) returns numeric
language sql stable as $$ select -variance_tjs(p_year) $$;

create or replace function saving_percent(p_year smallint) returns numeric
language sql stable as $$
  select round(saving_amount_tjs(p_year) / nullif(planned_total_tjs(approved_version(p_year)),0) * 100, 2)
$$;

create or replace function utilization_percent(p_year smallint) returns numeric
language sql stable as $$
  select round((1 - saving_amount_tjs(p_year) / nullif(planned_total_tjs(approved_version(p_year)),0)) * 100, 2)
$$;

-- ---------- Плановые / внеплановые (разделы 68–70) ----------
create or replace function unplanned_stats(p_year smallint)
returns table(
  unplanned_training_count integer, unplanned_participants integer,
  unplanned_hours numeric, unplanned_actual_cost numeric,
  all_completed_count integer, unplanned_percentage numeric)
language sql stable as $$
  with c as (
    select * from trainings
    where status = 'COMPLETED' and extract(year from start_date) = p_year
  )
  select
    (select count(*)::int from c where source_type = 'UNPLANNED'),
    (select coalesce(sum(participants_count(id)),0)::int from c where source_type = 'UNPLANNED'),
    (select coalesce(sum(man_hours(id)),0) from c where source_type = 'UNPLANNED'),
    (select coalesce(sum(actual_total(id)),0) from c where source_type = 'UNPLANNED'),
    (select count(*)::int from c),
    round((select count(*) from c where source_type = 'UNPLANNED')::numeric
          / nullif((select count(*) from c),0) * 100, 2)
$$;

-- ---------- Проверка логики PLANNED/UNPLANNED (раздел 74) ----------
create or replace view v_dq_source_logic as
select 'SRC_PLANNED_NO_REQUEST'::text as rule_code, 'WARNING'::dq_severity as severity,
       t.id::text as entity_id,
       'Обучение отмечено как плановое, но связанная заявка не найдена.'::text as message
from trainings t
where t.source_type = 'PLANNED' and t.request_id is null
union all
select 'SRC_CANDIDATE_UNCONFIRMED', 'INFO', t.id::text,
       'Обучение не найдено в плановых заявках. Возможно, это внеплановое обучение.'
from trainings t
where t.source_type = 'UNPLANNED' and not t.source_confirmed;

-- UNPLANNED + заявка: только с явным подтверждением (set local app.confirmed = 'yes')
create or replace function trg_training_source_guard() returns trigger language plpgsql as $$
begin
  if new.source_type = 'UNPLANNED' and new.request_id is not null
     and coalesce(current_setting('app.confirmed', true),'') <> 'yes' then
    raise exception 'Обучение внеплановое. Привязка заявки требует подтверждения.'
      using errcode = 'P0002';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger training_source_guard before insert or update on trainings
  for each row execute function trg_training_source_guard();

-- ---------- Досье сотрудника ----------
create or replace function employee_dossier(p_employee uuid)
returns table(
  year integer, training_id uuid, title text, start_date date, end_date date,
  hours numeric, kind training_kind, source_type source_type,
  department_at_time text, unit_at_time text, position_at_time text,
  cost_share_tjs numeric)
language sql stable as $$
  select extract(year from t.start_date)::int, t.id, t.title,
         coalesce(s.start_date, t.start_date), coalesce(s.end_date, t.end_date),
         coalesce(s.hours, t.hours), t.kind, t.source_type,
         p.department_snapshot, p.unit_snapshot, p.position_snapshot,
         cost_per_participant(t.id)
  from training_participants p
  join trainings t on t.id = p.training_id
  left join training_sessions s on s.id = p.session_id
  where p.employee_id = p_employee and p.attended
  order by 1, 4
$$;

-- ---------- Аудит ----------
create or replace function trg_audit() returns trigger language plpgsql security definer as $$
begin
  insert into audit_log(user_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), tg_table_name,
          coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['trainings','training_sessions','training_participants','expense_operations',
                           'budget_versions','budget_lines','training_requests','employees']
  loop
    if to_regclass(t) is not null then
      execute format('create trigger audit_%1$s after insert or update or delete on %1$I
                      for each row execute function trg_audit()', t);
    end if;
  end loop;
end $$;
