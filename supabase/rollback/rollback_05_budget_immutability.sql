-- Откат M5 (версии со статусом ARCHIVED, созданные ревизиями, останутся как есть)
drop function approve_budget_version(bigint);
drop function create_budget_revision(bigint, text);
drop trigger budget_items_guard on budget_line_items;
drop trigger budget_lines_guard on budget_lines;
drop trigger budget_version_guard on budget_versions;
drop function trg_budget_items_guard();
drop function trg_budget_lines_guard();
drop function budget_version_locked(bigint);
drop function trg_budget_version_guard();
drop index budget_one_open_revision;
drop index budget_versions_approved_by_idx;
drop index budget_versions_supersedes_idx;
alter table budget_versions
  drop column approved_by, drop column revision_reason, drop column revision_no, drop column supersedes_version_id;
