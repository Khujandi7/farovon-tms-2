-- Phase 1.5 · M5: APPROVED версия бюджета неизменяема. Изменения: новая DRAFT-ревизия -> approve.

alter table budget_versions
  add column supersedes_version_id bigint references budget_versions(id),
  add column revision_no smallint not null default 1,
  add column revision_reason text,
  add column approved_by uuid references profiles(id);
create index budget_versions_supersedes_idx on budget_versions (supersedes_version_id);
create index budget_versions_approved_by_idx on budget_versions (approved_by);
-- не более одной открытой ревизии на одну версию
create unique index budget_one_open_revision on budget_versions (supersedes_version_id)
  where status = 'DRAFT' and supersedes_version_id is not null;

create function trg_budget_version_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare flag boolean := coalesce(current_setting('app.budget_workflow', true), '') = 'yes';
begin
  if tg_op = 'INSERT' then
    if new.status in ('APPROVED','ARCHIVED') and not flag then
      raise exception 'Версия создаётся как DRAFT; утверждение только через approve_budget_version()'
        using errcode = 'P0010';
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.status <> 'DRAFT' then
      raise exception 'Удалять можно только DRAFT-версию' using errcode = 'P0010';
    end if;
    return old;
  end if;
  if old.status in ('APPROVED','ARCHIVED') then
    if not flag
       or not (old.status = 'APPROVED' and new.status = 'ARCHIVED')
       or (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
      raise exception 'Утверждённая версия неизменяема: создайте корректировку (create_budget_revision)'
        using errcode = 'P0010';
    end if;
  elsif new.status in ('APPROVED','ARCHIVED') and not flag then
    raise exception 'Утверждение только через approve_budget_version()' using errcode = 'P0010';
  end if;
  return new;
end $$;
create trigger budget_version_guard before insert or update or delete on budget_versions
  for each row execute function trg_budget_version_guard();

-- SECURITY DEFINER: охранный триггер должен видеть истину независимо от RLS читающего
create function budget_version_locked(p_version bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select status in ('APPROVED','ARCHIVED') from budget_versions where id = p_version), false)
$$;

create function trg_budget_lines_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' and budget_version_locked(old.version_id) then
    raise exception 'Строки утверждённой версии неизменяемы' using errcode = 'P0010';
  end if;
  if tg_op <> 'DELETE' and budget_version_locked(new.version_id) then
    raise exception 'Нельзя менять строки утверждённой версии' using errcode = 'P0010';
  end if;
  return coalesce(new, old);
end $$;
create trigger budget_lines_guard before insert or update or delete on budget_lines
  for each row execute function trg_budget_lines_guard();

create function trg_budget_items_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare lid bigint := coalesce(new.budget_line_id, old.budget_line_id);
begin
  if budget_version_locked((select version_id from budget_lines where id = lid)) then
    raise exception 'Статьи утверждённой версии неизменяемы' using errcode = 'P0010';
  end if;
  return coalesce(new, old);
end $$;
create trigger budget_items_guard before insert or update or delete on budget_line_items
  for each row execute function trg_budget_items_guard();

-- Новая DRAFT-ревизия от утверждённой версии (копия строк и статей)
create function create_budget_revision(p_from bigint, p_reason text) returns bigint
language plpgsql set search_path = public, pg_temp as $$
declare src budget_versions; v_new bigint; m budget_lines; l bigint;
begin
  select * into src from budget_versions where id = p_from;
  if not found or src.status <> 'APPROVED' then
    raise exception 'Корректировка создаётся только от утверждённой версии';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Укажите причину корректировки';
  end if;
  insert into budget_versions(name, fiscal_year, status, supersedes_version_id, revision_no, revision_reason)
  values (src.name, src.fiscal_year, 'DRAFT', src.id, src.revision_no + 1, p_reason)
  returning id into v_new;
  for m in select * from budget_lines where version_id = p_from order by id loop
    insert into budget_lines(version_id, request_id, topic, department_id, unit_id, requester_raw, format, kind,
                             participants_plan, amount_usd, period_raw, quarter, status, comment)
    values (v_new, m.request_id, m.topic, m.department_id, m.unit_id, m.requester_raw, m.format, m.kind,
            m.participants_plan, m.amount_usd, m.period_raw, m.quarter, m.status, m.comment)
    returning id into l;
    insert into budget_line_items(budget_line_id, category_id, amount_usd)
      select l, category_id, amount_usd from budget_line_items where budget_line_id = m.id;
  end loop;
  return v_new;
end $$;

-- Атомарно: прежняя APPROVED -> ARCHIVED, DRAFT -> APPROVED
create function approve_budget_version(p_version bigint) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v budget_versions;
begin
  select * into v from budget_versions where id = p_version for update;
  if not found or v.status <> 'DRAFT' then
    raise exception 'Утвердить можно только DRAFT-версию';
  end if;
  if (select value from app_settings where key = 'budget_fx_usd_tjs') is null then
    raise exception 'Не задан бюджетный курс USD→TJS (app_settings.budget_fx_usd_tjs)';
  end if;
  if not exists (select 1 from budget_lines where version_id = p_version) then
    raise exception 'В версии нет строк';
  end if;
  perform set_config('app.budget_workflow', 'yes', true);
  update budget_versions set status = 'ARCHIVED' where fiscal_year = v.fiscal_year and status = 'APPROVED';
  update budget_versions set status = 'APPROVED', approved_at = current_date, approved_by = auth.uid()
   where id = p_version;
  perform set_config('app.budget_workflow', 'no', true);
end $$;

revoke execute on function trg_budget_version_guard(), trg_budget_lines_guard(), trg_budget_items_guard()
  from public, anon, authenticated, service_role;
revoke execute on function budget_version_locked(bigint) from public, anon;
grant  execute on function budget_version_locked(bigint) to authenticated;
revoke execute on function create_budget_revision(bigint, text), approve_budget_version(bigint) from public, anon;
grant  execute on function create_budget_revision(bigint, text), approve_budget_version(bigint) to authenticated;
