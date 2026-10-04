-- Phase 1.5 · M4: HR и другие роли без доступа к деньгам получают NULL + явное состояние, а не 0.

create type financial_access as enum ('GRANTED','FINANCIAL_DATA_RESTRICTED');

-- Тот же список ролей, что у политик fin_read в 0003. Серверный контекст (postgres/service_role) доверенный.
create function has_financial_access() returns boolean language sql stable
set search_path = public, pg_temp as $$
  select current_user::text not in ('authenticated','anon')
      or coalesce(app_role() = any (array['ADMIN','ACADEMY_MANAGER','FINANCE','VIEWER']::app_role[]), false)
$$;

create function financial_access_state() returns financial_access language sql stable
set search_path = public, pg_temp as $$
  select (case when has_financial_access() then 'GRANTED' else 'FINANCIAL_DATA_RESTRICTED' end)::financial_access
$$;

-- Факт: проведённые операции (без сторно). NULL при отсутствии доступа; 0 только когда расходов реально нет.
create or replace function actual_total(p_training uuid) returns numeric
language sql stable set search_path = public, pg_temp as $$
  select case when has_financial_access()
              then (select coalesce(sum(amount_tjs), 0) from expense_operations
                    where training_id = p_training and voided_at is null) end
$$;

create or replace function planned_total_usd(p_version bigint) returns numeric
language sql stable set search_path = public, pg_temp as $$
  select case when has_financial_access()
              then (select coalesce(sum(amount_usd), 0) from budget_lines where version_id = p_version) end
$$;

create or replace function planned_total_tjs(p_version bigint) returns numeric
language plpgsql stable set search_path = public, pg_temp as $$
declare fx numeric;
begin
  if not has_financial_access() then return null; end if;
  select value::numeric into fx from app_settings where key = 'budget_fx_usd_tjs';
  if fx is null then
    raise exception 'Не задан бюджетный курс USD→TJS (app_settings.budget_fx_usd_tjs)';
  end if;
  return round(planned_total_usd(p_version) * fx, 2);
end $$;
-- cost_per_participant, variance_tjs, saving_*, utilization_percent, employee_dossier.cost_share_tjs
-- получают NULL автоматически (NULL распространяется по вычислениям).

create view v_training_financials with (security_invoker = true) as
select t.id as training_id,
       financial_access_state() as financial_access,
       case when has_financial_access() then coalesce(e.total, 0) end as actual_tjs,
       coalesce(p.n, 0)::int as participants,
       case when has_financial_access() and p.n > 0 then round(coalesce(e.total, 0) / p.n, 2) end
         as cost_per_participant_tjs
from trainings t
left join (select training_id, sum(amount_tjs) as total
           from expense_operations where voided_at is null group by training_id) e on e.training_id = t.id
left join (select training_id, count(*) filter (where attended) as n
           from training_participants group by training_id) p on p.training_id = t.id;
revoke all on v_training_financials from anon;

revoke execute on function has_financial_access(), financial_access_state() from public, anon;
grant  execute on function has_financial_access(), financial_access_state() to authenticated;
