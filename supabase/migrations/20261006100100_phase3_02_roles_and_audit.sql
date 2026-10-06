-- Phase 3 · M11: роли и аудит.
--  * ACADEMY_MANAGER и FINANCE (и ADMIN) создают и правят расходы; сторно остаётся за ADMIN и FINANCE (M2).
--  * HR вместе с ACADEMY_MANAGER ведёт справочник подразделений.
--  * audit_log.reason: причина изменения берётся из app.change_reason, который выставляют RPC.
--  * entity_audit(): ограниченный доступ к журналу по конкретной сущности (audit_log напрямую читает только ADMIN).

-- ---------- Права ----------
alter policy expense_operations_write on expense_operations
  using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]))
  with check (app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]));

alter policy org_units_write on org_units
  using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]))
  with check (app_role() = any ('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]));
alter policy org_unit_aliases_write on org_unit_aliases
  using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]))
  with check (app_role() = any ('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]));

-- ---------- Аудит с причиной ----------
alter table audit_log add column reason text;
create index audit_log_entity_idx on audit_log (table_name, row_id, at desc);
create index audit_log_training_idx on audit_log ((coalesce(new_row, old_row)->>'training_id'), at desc)
  where coalesce(new_row, old_row) ? 'training_id';
create index audit_log_user_idx on audit_log (user_id);

create or replace function trg_audit() returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare j jsonb := to_jsonb(coalesce(new, old));
begin
  insert into audit_log(user_id, table_name, row_id, action, old_row, new_row, reason)
  values (auth.uid(), tg_table_name,
          coalesce(j->>'id', j->>'key', concat_ws(':', j->>'rate_date', j->>'currency'),
                   concat_ws(':', j->>'participant_id', j->>'session_id')),
          tg_op,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end,
          nullif(current_setting('app.change_reason', true), ''));
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['employee_aliases','org_units','org_unit_aliases','training_trainers']
  loop
    execute format('create trigger audit_%1$s after insert or update or delete on %1$I
                    for each row execute function trg_audit()', t);
  end loop;
end $$;

-- ---------- История сущности ----------
-- Тренинг: сам тренинг + заходы, участники, посещаемость, расходы (расходы только при доступе к финансам).
-- Заявка: сама заявка. Сотрудник: сам сотрудник и его алиасы.
create function entity_audit(p_table text, p_id uuid, p_limit integer default 200)
returns table(id bigint, at timestamptz, user_id uuid, user_name text, table_name text, row_id text,
              action text, reason text, old_row jsonb, new_row jsonb, changes jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if app_role() is null then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if p_table not in ('trainings','training_requests','employees') then
    raise exception 'Неподдерживаемая сущность: %', p_table;
  end if;
  return query
  select a.id, a.at, a.user_id, pr.full_name, a.table_name, a.row_id, a.action, a.reason, a.old_row, a.new_row,
         case when a.action = 'UPDATE' then
                (select coalesce(jsonb_object_agg(k, jsonb_build_array(a.old_row->k, a.new_row->k)), '{}'::jsonb)
                   from jsonb_object_keys(a.new_row) k
                  where a.old_row->k is distinct from a.new_row->k and k not in ('updated_at','updated_by','marked_at'))
              when a.action = 'INSERT' then a.new_row else a.old_row end
    from audit_log a
    left join profiles pr on pr.id = a.user_id
   where (
          (a.table_name = p_table and a.row_id = p_id::text)
       or (p_table = 'trainings' and (
              (a.table_name in ('training_sessions','training_participants','training_trainers')
                 and coalesce(a.new_row, a.old_row)->>'training_id' = p_id::text)
           or (a.table_name = 'expense_operations'
                 and app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE,VIEWER}'::app_role[])
                 and coalesce(a.new_row, a.old_row)->>'training_id' = p_id::text)
           or (a.table_name = 'session_attendance' and exists (
                 select 1 from training_participants tp
                  where tp.id::text = coalesce(a.new_row, a.old_row)->>'participant_id' and tp.training_id = p_id))
           or (a.table_name = 'session_attendance' and not exists (
                 select 1 from training_participants tp
                  where tp.id::text = coalesce(a.new_row, a.old_row)->>'participant_id')
               and exists (select 1 from training_sessions ts
                  where ts.id::text = coalesce(a.new_row, a.old_row)->>'session_id' and ts.training_id = p_id))))
       or (p_table = 'employees' and a.table_name = 'employee_aliases'
             and coalesce(a.new_row, a.old_row)->>'employee_id' = p_id::text)
         )
   order by a.at desc, a.id desc
   limit greatest(least(p_limit, 1000), 1);
end $$;
revoke execute on function entity_audit(text, uuid, integer) from public, anon;
grant  execute on function entity_audit(text, uuid, integer) to authenticated;
