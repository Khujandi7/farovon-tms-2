-- Откат M3. Архивные тренинги после отката снова видны как обычные.
drop function archive_training(uuid, text);
drop trigger sessions_block_archived on training_sessions;
drop trigger participants_block_archived on training_participants;
drop trigger expense_block_archived on expense_operations;
drop function trg_block_archived_training();
drop trigger training_no_delete on trainings;
drop function trg_training_no_delete();
alter table expense_operations
  drop constraint expense_operations_training_id_fkey,
  add constraint expense_operations_training_id_fkey foreign key (training_id) references trainings(id) on delete cascade;
alter table training_participants
  drop constraint training_participants_training_id_fkey,
  add constraint training_participants_training_id_fkey foreign key (training_id) references trainings(id) on delete cascade;
alter table training_sessions
  drop constraint training_sessions_training_id_fkey,
  add constraint training_sessions_training_id_fkey foreign key (training_id) references trainings(id) on delete cascade;
drop index trainings_archived_by_idx;
alter table trainings drop column archived_at, drop column archived_by, drop column archive_reason;
-- прежний guard (миграция 0002)
create or replace function trg_training_source_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.source_type = 'UNPLANNED' and new.request_id is not null
     and coalesce(current_setting('app.confirmed', true),'') <> 'yes' then
    raise exception 'Обучение внеплановое. Привязка заявки требует подтверждения.'
      using errcode = 'P0002';
  end if;
  new.updated_at := now();
  return new;
end $$;
