-- Миграция 0003: RLS.
-- RLS = правило, которое определяет, какие данные может видеть конкретный пользователь.

create or replace function app_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- Включаем RLS на всех таблицах public
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t.tablename);
  end loop;
end $$;

-- helper: создать политики чтения и записи
create or replace procedure grant_table(p_table text, p_read app_role[], p_write app_role[])
language plpgsql as $$
begin
  execute format('create policy %I on %I for select to authenticated using (app_role() = any (%L::app_role[]))',
                 p_table||'_read', p_table, p_read);
  if array_length(p_write,1) is not null then
    execute format('create policy %I on %I for all to authenticated using (app_role() = any (%L::app_role[])) with check (app_role() = any (%L::app_role[]))',
                   p_table||'_write', p_table, p_write, p_write);
  end if;
end $$;

do $$
declare
  all_roles app_role[] := array['ADMIN','ACADEMY_MANAGER','HR','FINANCE','VIEWER']::app_role[];
  fin_read  app_role[] := array['ADMIN','ACADEMY_MANAGER','FINANCE','VIEWER']::app_role[];
  fin_write app_role[] := array['ADMIN','FINANCE']::app_role[];
  acad      app_role[] := array['ADMIN','ACADEMY_MANAGER']::app_role[];
  hr_write  app_role[] := array['ADMIN','ACADEMY_MANAGER','HR']::app_role[];
  t text;
begin
  -- общие данные: читают все, пишут ADMIN и ACADEMY_MANAGER
  foreach t in array array['org_units','org_unit_aliases','trainers','trainer_aliases','trainings',
        'training_sessions','training_trainers','training_requests','feedback_trainings',
        'feedback_responses','feedback_answers','expense_categories'] loop
    call grant_table(t, all_roles, acad);
  end loop;
  -- люди: пишут также HR
  foreach t in array array['employees','employee_aliases','training_participants'] loop
    call grant_table(t, all_roles, hr_write);
  end loop;
  -- телефоны: HR, ADMIN, ACADEMY_MANAGER
  call grant_table('employee_contacts', hr_write, hr_write);
  -- деньги
  foreach t in array array['expense_operations','budget_versions','budget_lines','budget_line_items','fx_rates'] loop
    call grant_table(t, fin_read, fin_write);
  end loop;
  call grant_table('app_settings', all_roles, fin_write);
  -- служебные
  call grant_table('profiles', all_roles, array['ADMIN']::app_role[]);
  call grant_table('source_files', acad, acad);
  call grant_table('source_records', acad, acad);
  call grant_table('dq_issues', acad || array['FINANCE','HR']::app_role[], acad);
  call grant_table('audit_log', array['ADMIN']::app_role[], array[]::app_role[]);
end $$;

-- Запрет менять и удалять аудит даже ADMIN-у
revoke update, delete on audit_log from authenticated;
-- amount_tjs / fx_rate пишет только триггер: клиенту запрещаем писать эти колонки
revoke insert, update on expense_operations from authenticated;
grant insert (training_id, category_id, amount, currency, operation_date, comment) on expense_operations to authenticated;
grant update (category_id, amount, currency, operation_date, comment) on expense_operations to authenticated;
