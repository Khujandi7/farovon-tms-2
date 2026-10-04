-- Phase 1.5 · M2: сторно расходов вместо физического удаления.

alter table expense_operations
  add column voided_at timestamptz,
  add column void_reason text;
-- voided_at / void_reason клиенту писать нельзя: column grants из 0003 их не включают.

revoke delete on expense_operations from authenticated;

-- Сторнированная операция неизменяема и необратима
create function trg_expense_void_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if old.voided_at is not null then
    raise exception 'Сторнированная операция неизменяема' using errcode = 'P0006';
  end if;
  return new;
end $$;
create trigger expense_void_guard before update on expense_operations
  for each row execute function trg_expense_void_guard();

create function void_expense(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(app_role() = any (array['ADMIN','FINANCE']::app_role[]), false) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Укажите причину сторно';
  end if;
  update expense_operations set voided_at = now(), void_reason = p_reason
   where id = p_id and voided_at is null;
  if not found then
    raise exception 'Операция не найдена или уже сторнирована';
  end if;
end $$;

revoke execute on function trg_expense_void_guard() from public, anon, authenticated, service_role;
revoke execute on function void_expense(uuid, text) from public, anon;
grant  execute on function void_expense(uuid, text) to authenticated;
