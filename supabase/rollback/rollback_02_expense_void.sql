-- Откат M2. Сторнированные строки после отката снова считаются фактом: сначала оцените последствия.
drop function void_expense(uuid, text);
drop trigger expense_void_guard on expense_operations;
drop function trg_expense_void_guard();
alter table expense_operations drop column voided_at, drop column void_reason;
grant delete on expense_operations to authenticated;
