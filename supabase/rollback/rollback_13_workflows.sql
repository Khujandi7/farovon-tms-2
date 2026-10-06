-- Откат M13: удаляет RPC рабочих процессов Phase 3.
drop function if exists revert_change(bigint, text), remove_employee_alias(bigint, text), add_employee_alias(uuid, text, text),
  update_employee(uuid, jsonb, text), create_employee(jsonb, text), update_expense(uuid, jsonb, text),
  add_expense(uuid, smallint, numeric, currency_code, date, text, text), set_attendance(jsonb, text),
  remove_participant(uuid, text), add_participants_by_unit(uuid, bigint, text), add_participants(uuid, uuid[], text),
  delete_session(uuid, text), upsert_session(uuid, uuid, jsonb, text), ensure_attendance_mode(uuid),
  set_request_archived(uuid, boolean, text), update_request(uuid, jsonb, text), create_request(jsonb, text),
  set_training_archived(uuid, boolean, text), link_request(uuid, uuid, source_type, boolean, text),
  update_training(uuid, jsonb, text), create_training(jsonb, text),
  next_employee_code(), next_request_code(integer), norm_name(text);
drop view if exists v_training_list;
