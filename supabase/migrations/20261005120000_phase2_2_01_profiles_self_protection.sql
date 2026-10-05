-- Phase 2.2 · M9: защита собственной строки profiles.
-- Пользователь (в т.ч. ADMIN) не может изменить себе role / is_active, сменить id или удалить свой профиль.
-- Другие пользователи: ADMIN управляет ими как раньше (profiles_write). Защита последнего ADMIN (profiles_guard, P0003) не меняется.
-- Не блокируется: SQL Editor / postgres, service_role и bootstrap_first_admin(): там auth.uid() IS NULL.
-- Код ошибки P0011 (P0004 зарезервирован, P0010 — бюджет).

create function trg_profiles_self_protect() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and old.id = auth.uid() then
    if tg_op = 'DELETE' then
      raise exception 'Нельзя удалить собственный профиль' using errcode = 'P0011';
    end if;
    if new.id is distinct from old.id
       or new.role is distinct from old.role
       or new.is_active is distinct from old.is_active then
      raise exception 'Нельзя изменить собственную роль или статус активности' using errcode = 'P0011';
    end if;
  end if;
  return coalesce(new, old);
end $$;

create trigger profiles_self_protect before update or delete on profiles
  for each row execute function trg_profiles_self_protect();

-- Триггерная функция не вызывается напрямую; default privileges Supabase выдают EXECUTE anon: закрываем явно
revoke execute on function trg_profiles_self_protect() from public, anon, authenticated, service_role;
