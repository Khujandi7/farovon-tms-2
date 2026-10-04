-- Откат M8: возвращает устаревшие столбцы личности (данных в них нет).
alter table feedback_responses
  add column employee_id uuid references employees(id),
  add column respondent_raw text not null default '',
  add column dedupe_key text,
  add column match_confidence numeric(5,2),
  add column match_status text not null default 'REVIEW' check (match_status in ('AUTO','REVIEW','CONFIRMED','REJECTED'));
alter table feedback_responses alter column dedupe_key set not null, alter column respondent_raw drop default;
alter table feedback_responses add constraint feedback_responses_dedupe_key_key unique (dedupe_key);
