-- Откат M1. Записи audit_log остаются.
drop function bootstrap_first_admin(text, text);
drop trigger profiles_guard on profiles;
drop function trg_profiles_guard();
do $$ declare t text; begin
  foreach t in array array['profiles','fx_rates','app_settings','budget_line_items','expense_categories','trainers']
  loop execute format('drop trigger audit_%1$s on %1$I', t); end loop;
end $$;
create or replace function trg_audit() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  insert into audit_log(user_id, table_name, row_id, action, old_row, new_row)
  values (auth.uid(), tg_table_name,
          coalesce((to_jsonb(new)->>'id'), (to_jsonb(old)->>'id')),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create or replace function app_role() returns app_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from profiles where id = auth.uid()
$$;
alter table profiles drop column is_active;
