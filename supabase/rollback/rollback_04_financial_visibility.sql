-- Откат M4: возвращает определения функций из миграции 0002 (без has_financial_access)
drop view v_training_financials;
create or replace function actual_total(p_training uuid) returns numeric language sql stable
set search_path = public, pg_temp as $$
  select coalesce(sum(amount_tjs),0) from expense_operations where training_id = p_training
$$;
create or replace function planned_total_usd(p_version bigint) returns numeric language sql stable
set search_path = public, pg_temp as $$
  select coalesce(sum(amount_usd),0) from budget_lines where version_id = p_version
$$;
create or replace function planned_total_tjs(p_version bigint) returns numeric language plpgsql stable
set search_path = public, pg_temp as $$
declare fx numeric;
begin
  select value::numeric into fx from app_settings where key = 'budget_fx_usd_tjs';
  if fx is null then
    raise exception 'Не задан бюджетный курс USD→TJS (app_settings.budget_fx_usd_tjs)';
  end if;
  return round(planned_total_usd(p_version) * fx, 2);
end $$;
drop function financial_access_state();
drop function has_financial_access();
drop type financial_access;
