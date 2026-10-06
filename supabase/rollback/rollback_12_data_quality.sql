-- Откат M12.
drop function if exists dq_resolve(bigint, text, text), dq_scan();
drop function if exists req_reason(text), req_role(app_role[]);
drop trigger if exists audit_dq_issues on dq_issues;
drop index if exists dq_issues_fingerprint_uq, dq_issues_status_idx, dq_issues_entity_idx, dq_issues_resolved_by_idx;
delete from dq_issues where status = 'IN_REVIEW';
alter table dq_issues drop column source, drop column details, drop column fingerprint,
  drop column resolved_by, drop column resolved_at, drop column resolution, drop column updated_at;
alter table dq_issues drop constraint dq_issues_status_check;
alter table dq_issues add constraint dq_issues_status_check check (status in ('OPEN','CONFIRMED_OK','FIXED','IGNORED'));
