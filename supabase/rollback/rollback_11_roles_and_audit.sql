-- Откат M11.
drop function if exists entity_audit(text, uuid, integer);
drop trigger if exists audit_employee_aliases on employee_aliases;
drop trigger if exists audit_org_units on org_units;
drop trigger if exists audit_org_unit_aliases on org_unit_aliases;
drop trigger if exists audit_training_trainers on training_trainers;
create or replace function trg_audit() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare j jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log(user_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), tg_table_name,
          coalesce(j->>'id', j->>'key', concat_ws(':', j->>'rate_date', j->>'currency')),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
drop index if exists audit_log_entity_idx, audit_log_training_idx, audit_log_user_idx;
alter table audit_log drop column reason;
alter policy org_unit_aliases_write on org_unit_aliases
  using (app_role() = any ('{ADMIN,ACADEMY_MANAGER}'::app_role[]))
  with check (app_role() = any ('{ADMIN,ACADEMY_MANAGER}'::app_role[]));
alter policy org_units_write on org_units
  using (app_role() = any ('{ADMIN,ACADEMY_MANAGER}'::app_role[]))
  with check (app_role() = any ('{ADMIN,ACADEMY_MANAGER}'::app_role[]));
alter policy expense_operations_write on expense_operations
  using (app_role() = any ('{ADMIN,FINANCE}'::app_role[]))
  with check (app_role() = any ('{ADMIN,FINANCE}'::app_role[]));
