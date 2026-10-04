-- Phase 1.5 · M3: архив тренингов вместо каскадного удаления; RESTRICT на финансовые и связанные факты.

alter table trainings
  add column archived_at timestamptz,
  add column archived_by uuid references profiles(id),
  add column archive_reason text;
create index trainings_archived_by_idx on trainings (archived_by);

alter table expense_operations
  drop constraint expense_operations_training_id_fkey,
  add constraint expense_operations_training_id_fkey
    foreign key (training_id) references trainings(id) on delete restrict;
alter table training_participants
  drop constraint training_participants_training_id_fkey,
  add constraint training_participants_training_id_fkey
    foreign key (training_id) references trainings(id) on delete restrict;
alter table training_sessions
  drop constraint training_sessions_training_id_fkey,
  add constraint training_sessions_training_id_fkey
    foreign key (training_id) references trainings(id) on delete restrict;

-- Физически удалить можно только пустой тренинг (без расходов, участников, сессий)
create function trg_training_no_delete() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if exists (select 1 from expense_operations where training_id = old.id)
     or exists (select 1 from training_participants where training_id = old.id)
     or exists (select 1 from training_sessions where training_id = old.id) then
    raise exception 'Тренинг с расходами, участниками или сессиями удалять нельзя: используйте archive_training()'
      using errcode = 'P0005';
  end if;
  return old;
end $$;
create trigger training_no_delete before delete on trainings
  for each row execute function trg_training_no_delete();

-- В архивный тренинг нельзя добавлять расходы, участников и сессии
create function trg_block_archived_training() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if exists (select 1 from trainings where id = new.training_id and archived_at is not null) then
    raise exception 'Тренинг в архиве: добавление запрещено' using errcode = 'P0005';
  end if;
  return new;
end $$;
create trigger expense_block_archived before insert on expense_operations
  for each row execute function trg_block_archived_training();
create trigger participants_block_archived before insert on training_participants
  for each row execute function trg_block_archived_training();
create trigger sessions_block_archived before insert on training_sessions
  for each row execute function trg_block_archived_training();

create function archive_training(p_id uuid, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Укажите причину архивации';
  end if;
  if exists (select 1 from expense_operations where training_id = p_id) then
    raise exception 'У тренинга есть расходы: архивировать нельзя. Установите статус CANCELLED или NOT_HELD';
  end if;
  update trainings set archived_at = now(), archived_by = auth.uid(), archive_reason = p_reason
   where id = p_id and archived_at is null;
  if not found then
    raise exception 'Тренинг не найден или уже в архиве';
  end if;
end $$;

-- Исправление: проверка привязки заявки к UNPLANNED только при INSERT или смене request_id / source_type.
-- Раньше любое UPDATE (смена статуса, архивация) требовало app.confirmed.
create or replace function trg_training_source_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.source_type = 'UNPLANNED' and new.request_id is not null
     and (tg_op = 'INSERT'
          or new.request_id is distinct from old.request_id
          or new.source_type is distinct from old.source_type)
     and coalesce(current_setting('app.confirmed', true), '') <> 'yes' then
    raise exception 'Обучение внеплановое. Привязка заявки требует подтверждения.'
      using errcode = 'P0002';
  end if;
  new.updated_at := now();
  return new;
end $$;

revoke execute on function trg_training_no_delete(), trg_block_archived_training()
  from public, anon, authenticated, service_role;
revoke execute on function archive_training(uuid, text) from public, anon;
grant  execute on function archive_training(uuid, text) to authenticated;
