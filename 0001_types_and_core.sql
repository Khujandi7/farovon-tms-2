-- FAROVON TMS 2.0 · Фаза 1 · Миграция 0001: типы и основные таблицы
-- Миграция = файл, который изменяет структуру базы данных контролируемым способом.

create extension if not exists pgcrypto;

-- ---------- Перечисления ----------
create type app_role as enum ('ADMIN','ACADEMY_MANAGER','HR','FINANCE','VIEWER');
create type training_format as enum ('ONLINE','OFFLINE','BLENDED');
create type training_kind as enum ('INTERNAL','EXTERNAL','UNSPECIFIED');
create type training_status as enum ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED','POSTPONED','NOT_HELD');
create type source_type as enum ('PLANNED','UNPLANNED');
create type unplanned_reason as enum ('URGENT_BUSINESS_NEED','MANAGEMENT_REQUEST','LEGAL_REQUIREMENT','NEW_PROJECT','EMPLOYEE_NEED','EXTERNAL_OPPORTUNITY','OTHER');
create type org_level as enum ('DEPARTMENT','UNIT');
create type trainer_kind as enum ('INTERNAL','EXTERNAL','ORGANIZATION');
create type request_status as enum ('NEW','REVIEW','APPROVED','REJECTED','PLANNED','DONE','CARRIED_FORWARD');
create type budget_status as enum ('DRAFT','APPROVED','CANCELLED','ARCHIVED');
create type currency_code as enum ('TJS','USD','EUR','RUB','UZS','KZT');
create type dq_severity as enum ('CRITICAL','ERROR','WARNING','INFO');
create type source_record_status as enum ('ACTIVE','CHANGED','MISSING_FROM_SOURCE','CONFLICT','ARCHIVED');
create type feedback_block as enum ('MATERIALS','TRAINER','ORG','APPLICATION');

-- ---------- Служебные ----------
create table app_settings (
  key text primary key,
  value text,
  description text,
  updated_at timestamptz not null default now()
);
insert into app_settings(key, value, description) values
  ('budget_fx_usd_tjs', null, 'Бюджетный курс USD→TJS для перевода плана в сомони. Вносит ADMIN или FINANCE'),
  ('long_program_hours', '100', 'Порог долгой программы, часов');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role app_role not null default 'VIEWER',
  created_at timestamptz not null default now()
);

-- ---------- Справочники ----------
create table org_units (
  id bigint generated always as identity primary key,
  parent_id bigint references org_units(id),
  name text not null,
  level org_level not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint org_units_level_parent check (
    (level = 'DEPARTMENT' and parent_id is null) or (level = 'UNIT' and parent_id is not null))
);
create unique index org_units_unique_name on org_units (coalesce(parent_id,0), lower(name));

create table org_unit_aliases (
  id bigint generated always as identity primary key,
  org_unit_id bigint not null references org_units(id) on delete cascade,
  alias_norm text not null,
  unique (alias_norm)
);

create table employees (
  id uuid primary key default gen_random_uuid(),
  canonical_id text not null unique,
  full_name text not null,
  name_norm text not null,
  department_id bigint references org_units(id),
  unit_id bigint references org_units(id),
  position text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index employees_name_norm_idx on employees (name_norm);

-- Телефоны отдельно: их видят только ADMIN, ACADEMY_MANAGER, HR
create table employee_contacts (
  employee_id uuid primary key references employees(id) on delete cascade,
  phone text
);

create table employee_aliases (
  id bigint generated always as identity primary key,
  employee_id uuid not null references employees(id) on delete cascade,
  alias_norm text not null,
  confidence numeric(5,2),
  confirmed_by uuid references profiles(id),
  unique (alias_norm)
);

create table trainers (
  id uuid primary key default gen_random_uuid(),
  canonical_id text not null unique,
  full_name text not null,
  kind trainer_kind not null,
  employee_id uuid references employees(id),
  created_at timestamptz not null default now()
);
create table trainer_aliases (
  id bigint generated always as identity primary key,
  trainer_id uuid not null references trainers(id) on delete cascade,
  alias_norm text not null,
  unique (alias_norm)
);

create table expense_categories (
  id smallint generated always as identity primary key,
  code text not null unique,
  name text not null,
  group_code text not null,
  is_trainer_fee boolean not null default false
);

-- ---------- Курсы ----------
create table fx_rates (
  rate_date date not null,
  currency currency_code not null,
  rate_to_tjs numeric(18,6) not null check (rate_to_tjs > 0),
  source text,
  primary key (rate_date, currency)
);

-- ---------- Бюджет и заявки ----------
create table budget_versions (
  id bigint generated always as identity primary key,
  name text not null,
  fiscal_year smallint not null,
  status budget_status not null default 'DRAFT',
  approved_at date,
  source_sheet text,
  note text,
  created_at timestamptz not null default now()
);
-- Только одна утверждённая версия на год
create unique index budget_one_approved_per_year on budget_versions (fiscal_year) where status = 'APPROVED';

create table training_requests (
  id uuid primary key default gen_random_uuid(),
  canonical_id text not null unique,
  plan_year smallint not null,
  request_date date,
  department_id bigint references org_units(id),
  unit_id bigint references org_units(id),
  requester_id uuid references employees(id),
  requester_raw text,
  topic text not null,
  direction text,
  goal text,
  participants_planned integer check (participants_planned >= 0),
  format training_format,
  kind training_kind default 'UNSPECIFIED',
  trainer_raw text,
  budget_amount numeric(14,2) check (budget_amount >= 0),
  budget_currency currency_code,
  period_raw text,
  status request_status not null default 'NEW',
  comment text,
  -- перенос на другой год (раздел 73)
  carry_forward boolean not null default false,
  original_request_id uuid references training_requests(id),
  original_year smallint,
  planned_year smallint,
  created_at timestamptz not null default now(),
  constraint req_budget_has_currency check (budget_amount is null or budget_currency is not null)
);

create table budget_lines (
  id bigint generated always as identity primary key,
  version_id bigint not null references budget_versions(id) on delete cascade,
  request_id uuid references training_requests(id),
  topic text not null,
  department_id bigint references org_units(id),
  unit_id bigint references org_units(id),
  requester_raw text,
  format training_format,
  kind training_kind default 'UNSPECIFIED',
  participants_plan integer check (participants_plan >= 0),
  amount_usd numeric(14,2) not null check (amount_usd >= 0),
  period_raw text,
  quarter smallint check (quarter between 1 and 4),
  status text,
  comment text
);
create table budget_line_items (
  id bigint generated always as identity primary key,
  budget_line_id bigint not null references budget_lines(id) on delete cascade,
  category_id smallint not null references expense_categories(id),
  amount_usd numeric(14,2) not null check (amount_usd >= 0),
  unique (budget_line_id, category_id)
);

-- ---------- Тренинги ----------
create table trainings (
  id uuid primary key default gen_random_uuid(),
  canonical_id text not null unique,
  legacy_reestr_id integer,
  title text not null,
  format training_format not null,
  kind training_kind not null,
  location text,
  hours numeric(7,1) not null check (hours > 0),
  start_date date not null,
  end_date date not null,
  status training_status not null,
  source_type source_type not null,
  source_confirmed boolean not null default true,   -- false = «кандидат», ждёт подтверждения (раздел 75)
  request_id uuid references training_requests(id),
  unplanned_reason unplanned_reason,                 -- необязательно (раздел 72)
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trainings_dates_ok check (end_date >= start_date)
);
create index trainings_year_idx on trainings (extract(year from start_date));

-- Один тренинг может проходить в несколько заходов (например, Реестр №7 + №8)
create table training_sessions (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings(id) on delete cascade,
  session_no smallint not null,
  start_date date not null,
  end_date date not null,
  hours numeric(7,1) not null check (hours > 0),
  legacy_reestr_id integer,
  unique (training_id, session_no),
  constraint sessions_dates_ok check (end_date >= start_date)
);

create table training_participants (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings(id) on delete cascade,
  session_id uuid references training_sessions(id),
  employee_id uuid not null references employees(id),
  attended boolean not null default true,
  -- «снимок» на момент участия, чтобы досье не менялось при переводе
  department_snapshot text,
  unit_snapshot text,
  position_snapshot text,
  unique (training_id, employee_id)
);
create index participants_employee_idx on training_participants (employee_id);

create table training_trainers (
  training_id uuid not null references trainings(id) on delete cascade,
  trainer_id uuid not null references trainers(id),
  primary key (training_id, trainer_id)
);

-- ---------- Факт расходов ----------
create table expense_operations (
  id uuid primary key default gen_random_uuid(),
  training_id uuid not null references trainings(id) on delete cascade,
  category_id smallint not null references expense_categories(id),
  amount numeric(14,2) not null check (amount >= 0),
  currency currency_code not null default 'TJS',
  operation_date date not null,
  fx_rate numeric(18,6),       -- заполняет триггер
  fx_date date,                -- заполняет триггер
  amount_tjs numeric(14,2),    -- заполняет триггер, с фронтенда не пишется
  comment text,
  created_at timestamptz not null default now()
);
create index expense_training_idx on expense_operations (training_id);

-- ---------- Обратная связь ----------
create table feedback_trainings (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- TR-001
  training_id uuid references trainings(id), -- пока NULL, пока сопоставление не подтверждено
  title text not null,
  trainer_raw text,
  event_date date
);
create table feedback_responses (
  id uuid primary key default gen_random_uuid(),
  submitted_at timestamp not null,
  feedback_training_id uuid references feedback_trainings(id),
  employee_id uuid references employees(id),
  respondent_raw text not null,
  comment text,
  is_archive boolean not null default false,   -- архив без оценок
  dedupe_key text not null,
  match_confidence numeric(5,2),
  match_status text not null default 'REVIEW' check (match_status in ('AUTO','REVIEW','CONFIRMED','REJECTED')),
  unique (dedupe_key)
);
create table feedback_answers (
  response_id uuid not null references feedback_responses(id) on delete cascade,
  block feedback_block not null,
  question_no smallint not null,
  score smallint not null check (score between 1 and 5),
  primary key (response_id, block, question_no)
);

-- ---------- Импорт, качество, аудит ----------
create table source_files (
  id bigint generated always as identity primary key,
  system text not null,         -- REESTR / BUDGET / FEEDBACK
  file_name text not null,
  file_hash text,
  uploaded_by uuid references profiles(id),
  uploaded_at timestamptz not null default now()
);
create table source_records (
  id bigint generated always as identity primary key,
  source_file_id bigint references source_files(id),
  sheet text not null,
  row_number integer not null,
  row_hash text not null,
  entity_table text,
  entity_id text,
  status source_record_status not null default 'ACTIVE',
  last_seen_at timestamptz not null default now(),
  unique (source_file_id, sheet, row_number)
);
create table dq_issues (
  id bigint generated always as identity primary key,
  rule_code text not null,
  severity dq_severity not null,
  entity_table text,
  entity_id text,
  message text not null,
  suggestion text,
  status text not null default 'OPEN' check (status in ('OPEN','CONFIRMED_OK','FIXED','IGNORED')),
  created_at timestamptz not null default now()
);
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  row_id text,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
