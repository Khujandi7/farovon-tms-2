-- Phase 1.5 · M1: Auth, аудит, защита последнего ADMIN, bootstrap первого ADMIN.

alter table profiles add column is_active boolean not null default true;

-- Неактивный пользователь = нет роли = нет доступа (мгновенно, даже при живом JWT)
create or replace function app_role() returns app_role
language sql stable security definer set search_path = public, pg_temp as $$
  select role from profiles where id = auth.uid() and is_active
$$;

-- Аудит: row_id и для таблиц без id (ключ app_settings.key, курс rate_date:currency).
-- create or replace сбрасывает SET, поэтому search_path указан явно.
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

do $$ declare t text; begin
  foreach t in array array['profiles','fx_rates','app_settings','budget_line_items','expense_categories','trainers']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I
                    for each row execute function trg_audit()', t);
  end loop;
end $$;

-- Последнего активного ADMIN нельзя понизить, деактивировать или удалить
create function trg_profiles_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare v_removing boolean;
begin
  if old.role = 'ADMIN' and old.is_active then
    if tg_op = 'DELETE' then v_removing := true;
    else v_removing := (new.role <> 'ADMIN' or not new.is_active);
    end if;
    if v_removing and not exists (
         select 1 from profiles p where p.role = 'ADMIN' and p.is_active and p.id <> old.id) then
      raise exception 'Нельзя убрать, понизить или деактивировать последнего активного ADMIN'
        using errcode = 'P0003';
    end if;
  end if;
  return coalesce(new, old);
end $$;
create trigger profiles_guard before update or delete on profiles
  for each row execute function trg_profiles_guard();

-- Одноразовый bootstrap первого ADMIN. Вызывается вручную из SQL Editor (postgres) или service_role.
create function bootstrap_first_admin(p_email text, p_full_name text) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if exists (select 1 from profiles where role = 'ADMIN') then
    raise exception 'ADMIN уже существует: bootstrap выполняется один раз';
  end if;
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'Пользователь % не найден в auth.users (создайте его в Authentication -> Users)', p_email;
  end if;
  insert into profiles(id, full_name, role) values (v_id, p_full_name, 'ADMIN');
  return v_id;
end $$;

-- Новые функции по умолчанию доступны anon (default privileges): закрываем явно
revoke execute on function bootstrap_first_admin(text, text) from public, anon, authenticated;
revoke execute on function trg_profiles_guard() from public, anon, authenticated, service_role;
