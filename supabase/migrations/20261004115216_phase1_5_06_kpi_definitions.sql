-- Phase 1.5 · M6: единые определения KPI для Dashboard и Reports. Считает только база.
--  A. financial_actual_tjs : проведённые expense_operations (не сторно), год по operation_date, статус тренинга не важен
--  B. delivered_*          : тренинги COMPLETED (не в архиве), год по start_date
--  C. in_progress_count    : тренинги IN_PROGRESS, отдельный показатель
--  D. unplanned_delivered_*: UNPLANNED + COMPLETED; доля от B; неподтверждённые «кандидаты» отдельно
--  E. unplanned_financial_actual_tjs : расходы по тренингам UNPLANNED, год по operation_date (подмножество A)
-- Отклонение = A - план. Нет доступа -> финансовые поля NULL + financial_access = FINANCIAL_DATA_RESTRICTED.

create function kpi_year(p_year smallint) returns table(
  financial_access financial_access,
  plan_status text,
  plan_usd numeric,
  plan_tjs numeric,
  financial_actual_tjs numeric,
  variance_tjs numeric,
  delivered_count integer,
  delivered_unique_participants integer,
  delivered_man_hours numeric,
  in_progress_count integer,
  unplanned_delivered_count integer,
  unplanned_delivered_pct numeric,
  unplanned_unconfirmed_count integer,
  unplanned_financial_actual_tjs numeric)
language sql stable set search_path = public, pg_temp as $$
  with ver as (
    select approved_version(p_year) as v,
           has_financial_access() as ok,
           (select value::numeric from app_settings where key = 'budget_fx_usd_tjs') as fx),
  tr as (select * from trainings where archived_at is null and extract(year from start_date) = p_year),
  dl as (select * from tr where status = 'COMPLETED'),
  fa as (select sum(amount_tjs) as s from expense_operations
         where voided_at is null and extract(year from operation_date) = p_year),
  ea as (select sum(x.amount_tjs) as s
         from expense_operations x join trainings t on t.id = x.training_id
         where x.voided_at is null and t.source_type = 'UNPLANNED'
           and extract(year from x.operation_date) = p_year)
  select
    financial_access_state(),
    case when not ver.ok then null
         when ver.v is null then 'NO_APPROVED_VERSION'
         when ver.fx is null then 'NO_FX'
         else 'OK' end,
    case when ver.ok and ver.v is not null then planned_total_usd(ver.v) end,
    case when ver.ok and ver.v is not null and ver.fx is not null then planned_total_tjs(ver.v) end,
    case when ver.ok then coalesce(fa.s, 0) end,
    case when ver.ok and ver.v is not null and ver.fx is not null
         then round(coalesce(fa.s, 0) - planned_total_tjs(ver.v), 2) end,
    (select count(*)::int from dl),
    (select count(distinct p.employee_id)::int
       from training_participants p join dl on dl.id = p.training_id where p.attended),
    (select coalesce(sum(man_hours(dl.id)), 0) from dl),
    (select count(*)::int from tr where status = 'IN_PROGRESS'),
    (select count(*)::int from dl where source_type = 'UNPLANNED'),
    round((select count(*) from dl where source_type = 'UNPLANNED')::numeric
          / nullif((select count(*) from dl), 0) * 100, 2),
    (select count(*)::int from dl where source_type = 'UNPLANNED' and not source_confirmed),
    case when ver.ok then coalesce(ea.s, 0) end
  from ver, fa, ea
$$;

comment on function variance_tjs(smallint)  is 'DEPRECATED (Phase 1.5): используйте kpi_year()';
comment on function saving_amount_tjs(smallint) is 'DEPRECATED (Phase 1.5): используйте kpi_year()';
comment on function saving_percent(smallint) is 'DEPRECATED (Phase 1.5): используйте kpi_year()';
comment on function utilization_percent(smallint) is 'DEPRECATED (Phase 1.5): используйте kpi_year()';
comment on function unplanned_stats(smallint) is 'DEPRECATED (Phase 1.5): используйте kpi_year()';

revoke execute on function kpi_year(smallint) from public, anon;
grant  execute on function kpi_year(smallint) to authenticated;
