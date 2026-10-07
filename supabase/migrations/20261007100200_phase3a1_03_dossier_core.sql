-- Phase 3A.1 · M16: цифровое досье — навыки/квалификации, сертификаты, экзамены (попытки), стоимость экзамена,
-- цели развития, документы (метаданные + приватный Storage). Все таблицы под RLS и аудитом.
-- Деньги: экзамены хранят стоимость в отдельной таблице exam_costs (RLS как у расходов) с тем же механизмом курсов fx_rates;
-- HR видит результаты экзаменов, но не суммы.

-- ---------- Навыки и квалификации ----------
create table skills (
  id smallint generated always as identity primary key,
  name text not null check (length(trim(name)) > 0),
  name_norm text not null,
  kind text not null default 'SKILL' check (kind in ('SKILL','QUALIFICATION','CERTIFICATION')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index skills_name_kind_key on skills (kind, name_norm);

-- История уровней: только добавление. Актуальный уровень — последняя запись (achieved_on, created_at).
create table employee_skills (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  skill_id smallint not null references skills(id),
  level text not null check (length(trim(level)) > 0),     -- Beginner/Intermediate/Advanced, B2, Passed … (свободно)
  achieved_on date not null default current_date,
  source text not null default 'MANUAL' check (source in ('MANUAL','EXAM','CERTIFICATE','EVENT','IMPORT')),
  source_ref uuid,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid()
);
create index employee_skills_employee_idx on employee_skills (employee_id, skill_id, achieved_on desc);
create index employee_skills_skill_idx on employee_skills (skill_id);
create index employee_skills_created_by_idx on employee_skills (created_by);

-- ---------- Документы (метаданные; файлы — в Supabase Storage) ----------
create table documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('CONTRACT','CERTIFICATE','DIPLOMA','INVOICE','ACT','PAYMENT_DOCUMENT','EXAM_RESULT','APPLICATION','AGREEMENT','OTHER')),
  title text not null check (length(trim(title)) > 0),
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  storage_path text not null unique,
  status text not null default 'PENDING' check (status in ('PENDING','UPLOADED')),
  employee_id uuid references employees(id),
  training_id uuid references trainings(id),
  exam_id uuid,                     -- FK добавляется ниже (exams создаётся позже)
  request_id uuid references training_requests(id),
  agreement_id uuid,                -- FK в M17
  certificate_id uuid,              -- FK ниже
  expires_on date,
  note text,
  uploaded_by uuid references profiles(id) default auth.uid(),
  uploaded_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references profiles(id),
  archive_reason text
);
create index documents_employee_idx on documents (employee_id);
create index documents_training_idx on documents (training_id);
create index documents_exam_idx on documents (exam_id);
create index documents_request_idx on documents (request_id);
create index documents_agreement_idx on documents (agreement_id);
create index documents_certificate_idx on documents (certificate_id);
create index documents_uploaded_by_idx on documents (uploaded_by);
create index documents_archived_by_idx on documents (archived_by);
create index documents_expires_idx on documents (expires_on) where expires_on is not null;

-- ---------- Сертификаты ----------
create table certificates (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  name text not null check (length(trim(name)) > 0),
  cert_type text not null default 'TRAINING' check (cert_type in ('TRAINING','COURSE','EXAM','INTERNATIONAL','DIPLOMA','LICENSE')),
  issuing_organization text,
  provider_id uuid references learning_providers(id),
  issue_date date,
  expiration_date date,
  certificate_number text,
  skill_id smallint references skills(id),
  training_id uuid references trainings(id),
  exam_id uuid,
  document_id uuid references documents(id),
  revoked_at timestamptz,
  revoked_reason text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  archived_at timestamptz,
  constraint certificates_dates_ok check (expiration_date is null or issue_date is null or expiration_date >= issue_date)
);
create index certificates_employee_idx on certificates (employee_id);
create index certificates_expiration_idx on certificates (expiration_date) where expiration_date is not null;
create index certificates_training_idx on certificates (training_id);
create index certificates_exam_idx on certificates (exam_id);
create index certificates_document_idx on certificates (document_id);
create index certificates_skill_idx on certificates (skill_id);
create index certificates_provider_idx on certificates (provider_id);
create index certificates_created_by_idx on certificates (created_by);
create index certificates_updated_by_idx on certificates (updated_by);

-- Статус вычисляется (не хранится — не устаревает): REVOKED > NO_EXPIRATION > EXPIRED > ACTIVE
create function certificate_status(p_revoked timestamptz, p_exp date) returns text
language sql stable set search_path = public, pg_temp as $$
  select case when p_revoked is not null then 'REVOKED'
              when p_exp is null then 'NO_EXPIRATION'
              when p_exp < current_date then 'EXPIRED' else 'ACTIVE' end
$$;
create view v_certificates with (security_invoker = true) as
  select c.*, certificate_status(c.revoked_at, c.expiration_date) as status,
         case when c.expiration_date is not null then c.expiration_date - current_date end as days_left
    from certificates c;

-- ---------- Экзамены: одна строка = одна попытка ----------
create table exams (
  id uuid primary key default gen_random_uuid(),
  canonical_id text not null unique,
  employee_id uuid not null references employees(id),
  skill_id smallint not null references skills(id),          -- квалификация (CAP, ACCA …)
  provider_id uuid references learning_providers(id),
  training_id uuid references trainings(id),                  -- подготовка/групповой экзамен (необязательно)
  attempt_no integer not null check (attempt_no >= 1),
  exam_date date not null,
  status text not null default 'SCHEDULED' check (status in ('SCHEDULED','COMPLETED','CANCELLED')),
  result text not null default 'PENDING' check (result in ('PENDING','PASSED','FAILED','NOT_ATTENDED','OTHER')),
  score numeric(7,2),
  result_note text,
  comment text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  archived_at timestamptz,
  unique (employee_id, skill_id, attempt_no)
);
create index exams_skill_idx on exams (skill_id);
create index exams_provider_idx on exams (provider_id);
create index exams_training_idx on exams (training_id);
create index exams_date_idx on exams (exam_date);
create index exams_created_by_idx on exams (created_by);
create index exams_updated_by_idx on exams (updated_by);

alter table documents add constraint documents_exam_fk foreign key (exam_id) references exams(id);
alter table certificates add constraint certificates_exam_fk foreign key (exam_id) references exams(id);
alter table documents add constraint documents_certificate_fk foreign key (certificate_id) references certificates(id);

-- Стоимость экзамена и источник финансирования — финансовые данные (RLS как у расходов)
create table exam_costs (
  id uuid not null unique default gen_random_uuid(),   -- нужен аудиту (trg_audit берёт ключ строки из id)
  exam_id uuid primary key references exams(id),
  fee numeric(14,2) not null check (fee >= 0),
  currency currency_code not null default 'TJS',
  fee_date date not null default current_date,
  fx_rate numeric(18,6),
  fx_date date,
  fee_tjs numeric(14,2),
  funding_source text not null default 'COMPANY' check (funding_source in ('COMPANY','EMPLOYEE','SHARED','EXTERNAL','OTHER')),
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create index exam_costs_updated_by_idx on exam_costs (updated_by);

-- Курс берётся из fx_rates тем же правилом, что у расходов (нет курса — ошибка, USD=1 не подставляется)
create function trg_exam_cost_fx() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare r record;
begin
  select * into r from fx_rate_on(new.currency, new.fee_date);
  new.fx_rate := r.rate; new.fx_date := r.rate_date; new.fee_tjs := round(new.fee * r.rate, 2);
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;
create trigger exam_costs_fx before insert or update on exam_costs for each row execute function trg_exam_cost_fx();

-- ---------- Цели плана развития ----------
create table development_goals (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  plan_year smallint not null check (plan_year between 2000 and 2100),
  title text not null check (length(trim(title)) > 0),
  goal_type text not null default 'OTHER' check (goal_type in ('TRAINING','COURSE','EXAM','CERTIFICATE','SKILL','OTHER')),
  status text not null default 'PLANNED' check (status in ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED')),
  due_date date,
  training_id uuid references trainings(id),
  exam_id uuid references exams(id),
  certificate_id uuid references certificates(id),
  skill_id smallint references skills(id),
  note text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id)
);
create index development_goals_employee_idx on development_goals (employee_id, plan_year);
create index development_goals_training_idx on development_goals (training_id);
create index development_goals_exam_idx on development_goals (exam_id);
create index development_goals_certificate_idx on development_goals (certificate_id);
create index development_goals_skill_idx on development_goals (skill_id);
create index development_goals_created_by_idx on development_goals (created_by);
create index development_goals_updated_by_idx on development_goals (updated_by);

-- ---------- Служебные триггеры ----------
create function trg_touch_actor() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
create trigger certificates_touch before update on certificates for each row execute function trg_touch_actor();
create trigger exams_touch before update on exams for each row execute function trg_touch_actor();
create trigger goals_touch before update on development_goals for each row execute function trg_touch_actor();

-- Экзамен: результат определяет статус; архивные записи не меняются
create function trg_exam_sync() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.status <> 'CANCELLED' then
    new.status := case when new.result = 'PENDING' then 'SCHEDULED' else 'COMPLETED' end;
  end if;
  return new;
end $$;
create trigger exams_sync before insert or update of result, status on exams for each row execute function trg_exam_sync();

-- Навыки: история неизменяема (только добавление)
create function trg_immutable() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin raise exception 'Запись неизменяема: добавьте новую' using errcode = 'P0017'; end $$;
create trigger employee_skills_immutable before update or delete on employee_skills for each row execute function trg_immutable();

-- ---------- Коды экзаменов ----------
create function next_exam_code(p_year integer) returns text language plpgsql
set search_path = public, pg_temp as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('exam_code'));
  select coalesce(max(substring(canonical_id from '^EX-' || p_year || '-(\d+)$')::int), 0) + 1 into n
    from exams where canonical_id like 'EX-' || p_year || '-%';
  return 'EX-' || p_year || '-' || lpad(n::text, 3, '0');
end $$;

-- ---------- Аудит ----------
create trigger audit_skills after insert or update or delete on skills for each row execute function trg_audit();
create trigger audit_employee_skills after insert or update or delete on employee_skills for each row execute function trg_audit();
create trigger audit_documents after insert or update or delete on documents for each row execute function trg_audit();
create trigger audit_certificates after insert or update or delete on certificates for each row execute function trg_audit();
create trigger audit_exams after insert or update or delete on exams for each row execute function trg_audit();
create trigger audit_exam_costs after insert or update or delete on exam_costs for each row execute function trg_audit();
create trigger audit_development_goals after insert or update or delete on development_goals for each row execute function trg_audit();

-- ================= RLS =================
alter table skills enable row level security;
alter table employee_skills enable row level security;
alter table documents enable row level security;
alter table certificates enable row level security;
alter table exams enable row level security;
alter table exam_costs enable row level security;
alter table development_goals enable row level security;

call grant_table('skills', array['ADMIN','ACADEMY_MANAGER','HR','FINANCE','VIEWER']::app_role[], array['ADMIN','ACADEMY_MANAGER','HR']::app_role[]);
call grant_table('certificates', array['ADMIN','ACADEMY_MANAGER','HR','FINANCE','VIEWER']::app_role[], array['ADMIN','ACADEMY_MANAGER','HR']::app_role[]);
call grant_table('exams', array['ADMIN','ACADEMY_MANAGER','HR','FINANCE','VIEWER']::app_role[], array['ADMIN','ACADEMY_MANAGER','HR']::app_role[]);
call grant_table('exam_costs', array['ADMIN','ACADEMY_MANAGER','FINANCE','VIEWER']::app_role[], array['ADMIN','ACADEMY_MANAGER','FINANCE']::app_role[]);
call grant_table('development_goals', array['ADMIN','ACADEMY_MANAGER','HR','FINANCE','VIEWER']::app_role[], array['ADMIN','ACADEMY_MANAGER','HR']::app_role[]);
-- история навыков: читать все, добавлять ADMIN/ACADEMY_MANAGER/HR; изменять и удалять нельзя
create policy employee_skills_read on employee_skills for select to authenticated
  using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,HR,FINANCE,VIEWER}'::app_role[]));
create policy employee_skills_insert on employee_skills for insert to authenticated
  with check (app_role() = any ('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]));

-- Документы: финансовые типы видят/ведут только финансовые роли, остальные — HR тоже; VIEWER файлов не видит
create function doc_is_financial(p_type text) returns boolean language sql immutable
set search_path = public, pg_temp as $$
  select p_type in ('CONTRACT','INVOICE','ACT','PAYMENT_DOCUMENT','AGREEMENT')
$$;
create function can_doc(p_type text, p_write boolean) returns boolean language sql stable
set search_path = public, pg_temp as $$
  select coalesce(app_role() = any (
    case when doc_is_financial(p_type) then '{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]
         when p_write then '{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]
         else '{ADMIN,ACADEMY_MANAGER,HR,FINANCE}'::app_role[] end), false)
$$;
create policy documents_read on documents for select to authenticated using (can_doc(doc_type, false));
create policy documents_insert on documents for insert to authenticated with check (can_doc(doc_type, true) and uploaded_by = auth.uid());
create policy documents_update on documents for update to authenticated using (can_doc(doc_type, true)) with check (can_doc(doc_type, true));

-- ================= Storage =================
do $$ begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('tms-documents', 'tms-documents', false, 20971520,
            array['application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv'])
    on conflict (id) do nothing;
    -- Файл читается, если читается его строка в documents (RLS применяется внутри); загрузка — только в путь, зарегистрированный автором.
    -- Обновления и удаления объектов нет: документ архивируется в метаданных, файл остаётся.
    execute $p$create policy tms_documents_read on storage.objects for select to authenticated
      using (bucket_id = 'tms-documents' and exists (select 1 from public.documents d where d.storage_path = name))$p$;
    execute $p$create policy tms_documents_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'tms-documents' and exists (
        select 1 from public.documents d where d.storage_path = name and d.uploaded_by = auth.uid() and d.status = 'PENDING'))$p$;
  end if;
end $$;

-- ================= RPC =================
create function upsert_skill(p_id smallint, p jsonb, p_reason text default null) returns smallint
language plpgsql set search_path = public, pg_temp as $$
declare v_id smallint; v_name text := trim(coalesce(p->>'name',''));
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if v_name = '' then raise exception 'Укажите название' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Справочник навыков'), true);
  if p_id is null then
    insert into skills(name, name_norm, kind) values (v_name, norm_name(v_name), coalesce(nullif(p->>'kind',''), 'SKILL')) returning id into v_id;
  else
    update skills set name = case when p ? 'name' then v_name else name end,
                      name_norm = case when p ? 'name' then norm_name(v_name) else name_norm end,
                      is_active = case when p ? 'is_active' then (p->>'is_active')::boolean else is_active end
     where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Навык не найден' using errcode = 'P0015'; end if;
  end if;
  return v_id;
end $$;

create function add_employee_skill(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if length(trim(coalesce(p->>'level',''))) = 0 then raise exception 'Укажите уровень' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Изменение уровня навыка'), true);
  insert into employee_skills(employee_id, skill_id, level, achieved_on, note)
  values ((p->>'employee_id')::uuid, (p->>'skill_id')::smallint, trim(p->>'level'),
          coalesce(nullif(p->>'achieved_on','')::date, current_date), nullif(trim(coalesce(p->>'note','')), ''))
  returning id into v_id;
  return v_id;
end $$;

create function create_exam(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_emp uuid := (p->>'employee_id')::uuid; v_skill smallint := (p->>'skill_id')::smallint;
        v_date date := nullif(p->>'exam_date','')::date; v_n integer;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if v_emp is null or v_skill is null then raise exception 'Укажите сотрудника и квалификацию' using errcode = 'P0015'; end if;
  if v_date is null then raise exception 'Укажите дату экзамена' using errcode = 'P0015'; end if;
  if not exists (select 1 from employees where id = v_emp and is_active) then
    raise exception 'Сотрудник не найден или не работает' using errcode = 'P0015'; end if;
  if not exists (select 1 from skills where id = v_skill and is_active) then
    raise exception 'Квалификация не найдена или отключена' using errcode = 'P0015'; end if;
  perform pg_advisory_xact_lock(hashtext('exam_attempt:' || v_emp || v_skill));
  select coalesce(nullif(p->>'attempt_no','')::int, coalesce(max(attempt_no), 0) + 1) into v_n
    from exams where employee_id = v_emp and skill_id = v_skill;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создание экзамена'), true);
  insert into exams(canonical_id, employee_id, skill_id, provider_id, training_id, attempt_no, exam_date, comment)
  values (next_exam_code(extract(year from v_date)::int), v_emp, v_skill, nullif(p->>'provider_id','')::uuid,
          nullif(p->>'training_id','')::uuid, v_n, v_date, nullif(trim(coalesce(p->>'comment','')), ''))
  returning id into v_id;
  return v_id;
end $$;

create function update_exam(p_id uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare k text; x exams%rowtype; v_r text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  select * into x from exams where id = p_id for update;
  if not found then raise exception 'Экзамен не найден' using errcode = 'P0015'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('exam_date','provider_id','training_id','comment','status') then
      raise exception 'Поле «%» нельзя менять здесь (результат — set_exam_result)', k using errcode = 'P0015'; end if;
  end loop;
  if p_patch ? 'status' and (p_patch->>'status') not in ('SCHEDULED','COMPLETED','CANCELLED') then
    raise exception 'Недопустимый статус' using errcode = 'P0015'; end if;
  v_r := case when p_patch ? 'status' or p_patch ? 'exam_date' then req_reason(p_reason) else nullif(trim(coalesce(p_reason,'')), '') end;
  perform set_config('app.change_reason', coalesce(v_r, ''), true);
  update exams set
    exam_date = case when p_patch ? 'exam_date' then (p_patch->>'exam_date')::date else exam_date end,
    provider_id = case when p_patch ? 'provider_id' then nullif(p_patch->>'provider_id','')::uuid else provider_id end,
    training_id = case when p_patch ? 'training_id' then nullif(p_patch->>'training_id','')::uuid else training_id end,
    comment = case when p_patch ? 'comment' then nullif(trim(coalesce(p_patch->>'comment','')), '') else comment end,
    status = case when p_patch ? 'status' then p_patch->>'status' else status end
  where id = p_id;
end $$;

-- Результат попытки. Первая отметка результата — без причины, изменение уже выставленного результата — с причиной.
-- Попытки не перезаписываются: пересдача — новая строка (create_exam).
create function set_exam_result(p_id uuid, p_result text, p_score numeric default null, p_note text default null, p_reason text default null)
returns void language plpgsql set search_path = public, pg_temp as $$
declare x exams%rowtype; v_kind text; v_r text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if p_result not in ('PENDING','PASSED','FAILED','NOT_ATTENDED','OTHER') then
    raise exception 'Недопустимый результат' using errcode = 'P0015'; end if;
  select * into x from exams where id = p_id for update;
  if not found then raise exception 'Экзамен не найден' using errcode = 'P0015'; end if;
  if x.status = 'CANCELLED' then raise exception 'Экзамен отменён' using errcode = 'P0015'; end if;
  v_r := case when x.result <> 'PENDING' and x.result is distinct from p_result then req_reason(p_reason)
              else nullif(trim(coalesce(p_reason,'')), '') end;
  perform set_config('app.change_reason', coalesce(v_r, 'Результат экзамена'), true);
  update exams set result = p_result, score = p_score, result_note = nullif(trim(coalesce(p_note,'')), '') where id = p_id;
  select kind into v_kind from skills where id = x.skill_id;
  if p_result = 'PASSED' and v_kind in ('QUALIFICATION','CERTIFICATION')
     and not exists (select 1 from employee_skills where source = 'EXAM' and source_ref = p_id) then
    insert into employee_skills(employee_id, skill_id, level, achieved_on, source, source_ref, note)
    values (x.employee_id, x.skill_id, 'Passed', x.exam_date, 'EXAM', p_id, 'Экзамен ' || x.canonical_id);
  end if;
end $$;

create function set_exam_cost(p_exam uuid, p jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_old exam_costs%rowtype; v_fee numeric := nullif(p->>'fee','')::numeric;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]);
  if not exists (select 1 from exams where id = p_exam) then raise exception 'Экзамен не найден' using errcode = 'P0015'; end if;
  if v_fee is null or v_fee < 0 then raise exception 'Укажите стоимость (0 или больше)' using errcode = 'P0015'; end if;
  select * into v_old from exam_costs where exam_id = p_exam;
  perform set_config('app.change_reason', case when found then req_reason(p_reason) else coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Стоимость экзамена') end, true);
  insert into exam_costs(exam_id, fee, currency, fee_date, funding_source, note)
  values (p_exam, v_fee, coalesce(nullif(p->>'currency','')::currency_code, 'TJS'),
          coalesce(nullif(p->>'fee_date','')::date, (select exam_date from exams where id = p_exam)),
          coalesce(nullif(p->>'funding_source',''), 'COMPANY'), nullif(trim(coalesce(p->>'note','')), ''))
  on conflict (exam_id) do update set fee = excluded.fee, currency = excluded.currency, fee_date = excluded.fee_date,
    funding_source = excluded.funding_source, note = excluded.note;
end $$;

create function create_certificate(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if length(trim(coalesce(p->>'name',''))) = 0 then raise exception 'Укажите название сертификата' using errcode = 'P0015'; end if;
  if nullif(p->>'employee_id','') is null then raise exception 'Укажите сотрудника' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Добавление сертификата'), true);
  insert into certificates(employee_id, name, cert_type, issuing_organization, provider_id, issue_date, expiration_date,
                           certificate_number, skill_id, training_id, exam_id, document_id, notes)
  values ((p->>'employee_id')::uuid, trim(p->>'name'), coalesce(nullif(p->>'cert_type',''), 'TRAINING'),
          nullif(trim(coalesce(p->>'issuing_organization','')), ''), nullif(p->>'provider_id','')::uuid,
          nullif(p->>'issue_date','')::date, nullif(p->>'expiration_date','')::date,
          nullif(trim(coalesce(p->>'certificate_number','')), ''), nullif(p->>'skill_id','')::smallint,
          nullif(p->>'training_id','')::uuid, nullif(p->>'exam_id','')::uuid, nullif(p->>'document_id','')::uuid,
          nullif(trim(coalesce(p->>'notes','')), ''))
  returning id into v_id;
  return v_id;
end $$;

create function update_certificate(p_id uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare k text; v_r text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('name','cert_type','issuing_organization','provider_id','issue_date','expiration_date','certificate_number',
                 'skill_id','training_id','exam_id','document_id','notes') then
      raise exception 'Поле «%» нельзя менять', k using errcode = 'P0015'; end if;
  end loop;
  v_r := case when p_patch ? 'expiration_date' or p_patch ? 'issue_date' then req_reason(p_reason) else nullif(trim(coalesce(p_reason,'')), '') end;
  perform set_config('app.change_reason', coalesce(v_r, ''), true);
  update certificates set
    name = case when p_patch ? 'name' then trim(p_patch->>'name') else name end,
    cert_type = case when p_patch ? 'cert_type' then p_patch->>'cert_type' else cert_type end,
    issuing_organization = case when p_patch ? 'issuing_organization' then nullif(trim(coalesce(p_patch->>'issuing_organization','')), '') else issuing_organization end,
    provider_id = case when p_patch ? 'provider_id' then nullif(p_patch->>'provider_id','')::uuid else provider_id end,
    issue_date = case when p_patch ? 'issue_date' then nullif(p_patch->>'issue_date','')::date else issue_date end,
    expiration_date = case when p_patch ? 'expiration_date' then nullif(p_patch->>'expiration_date','')::date else expiration_date end,
    certificate_number = case when p_patch ? 'certificate_number' then nullif(trim(coalesce(p_patch->>'certificate_number','')), '') else certificate_number end,
    skill_id = case when p_patch ? 'skill_id' then nullif(p_patch->>'skill_id','')::smallint else skill_id end,
    training_id = case when p_patch ? 'training_id' then nullif(p_patch->>'training_id','')::uuid else training_id end,
    exam_id = case when p_patch ? 'exam_id' then nullif(p_patch->>'exam_id','')::uuid else exam_id end,
    document_id = case when p_patch ? 'document_id' then nullif(p_patch->>'document_id','')::uuid else document_id end,
    notes = case when p_patch ? 'notes' then nullif(trim(coalesce(p_patch->>'notes','')), '') else notes end
  where id = p_id;
  if not found then raise exception 'Сертификат не найден' using errcode = 'P0015'; end if;
end $$;

create function revoke_certificate(p_id uuid, p_revoked boolean, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  update certificates set revoked_at = case when p_revoked then now() else null end,
                          revoked_reason = case when p_revoked then trim(p_reason) else null end where id = p_id;
  if not found then raise exception 'Сертификат не найден' using errcode = 'P0015'; end if;
end $$;

create function upsert_goal(p_id uuid, p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_status text := nullif(p->>'status','');
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR}'::app_role[]);
  if v_status is not null and v_status not in ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED') then
    raise exception 'Недопустимый статус цели' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'План развития'), true);
  if p_id is null then
    if length(trim(coalesce(p->>'title',''))) = 0 then raise exception 'Укажите цель' using errcode = 'P0015'; end if;
    insert into development_goals(employee_id, plan_year, title, goal_type, status, due_date, training_id, exam_id, certificate_id, skill_id, note, completed_at)
    values ((p->>'employee_id')::uuid, coalesce(nullif(p->>'plan_year','')::smallint, extract(year from current_date)::smallint),
            trim(p->>'title'), coalesce(nullif(p->>'goal_type',''), 'OTHER'), coalesce(v_status, 'PLANNED'),
            nullif(p->>'due_date','')::date, nullif(p->>'training_id','')::uuid, nullif(p->>'exam_id','')::uuid,
            nullif(p->>'certificate_id','')::uuid, nullif(p->>'skill_id','')::smallint, nullif(trim(coalesce(p->>'note','')), ''),
            case when v_status = 'COMPLETED' then now() end)
    returning id into v_id;
  else
    update development_goals set
      title = case when p ? 'title' then trim(p->>'title') else title end,
      goal_type = case when p ? 'goal_type' then p->>'goal_type' else goal_type end,
      status = coalesce(v_status, status),
      completed_at = case when v_status = 'COMPLETED' and status <> 'COMPLETED' then now()
                          when v_status is not null and v_status <> 'COMPLETED' then null else completed_at end,
      due_date = case when p ? 'due_date' then nullif(p->>'due_date','')::date else due_date end,
      training_id = case when p ? 'training_id' then nullif(p->>'training_id','')::uuid else training_id end,
      exam_id = case when p ? 'exam_id' then nullif(p->>'exam_id','')::uuid else exam_id end,
      certificate_id = case when p ? 'certificate_id' then nullif(p->>'certificate_id','')::uuid else certificate_id end,
      skill_id = case when p ? 'skill_id' then nullif(p->>'skill_id','')::smallint else skill_id end,
      note = case when p ? 'note' then nullif(trim(coalesce(p->>'note','')), '') else note end
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Цель не найдена' using errcode = 'P0015'; end if;
  end if;
  return v_id;
end $$;

-- Документы. 1) register_document создаёт запись PENDING и возвращает путь; 2) файл загружается в этот путь под сессией пользователя;
-- 3) confirm_document проверяет, что объект появился в Storage.
create function register_document(p jsonb) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare v_type text := p->>'doc_type'; v_id uuid := gen_random_uuid(); v_ext text; v_path text; v_mime text := p->>'mime_type';
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR,FINANCE}'::app_role[]);
  if not can_doc(v_type, true) then raise exception 'Недостаточно прав для этого типа документа' using errcode = '42501'; end if;
  if v_mime not in ('application/pdf','image/png','image/jpeg','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv') then
    raise exception 'Тип файла не поддерживается (PDF, PNG, JPG, DOCX, XLSX, CSV)' using errcode = 'P0015'; end if;
  if length(trim(coalesce(p->>'title',''))) = 0 then raise exception 'Укажите название документа' using errcode = 'P0015'; end if;
  if (p->>'size_bytes')::bigint > 20971520 then raise exception 'Файл больше 20 МБ' using errcode = 'P0015'; end if;
  if coalesce(nullif(p->>'employee_id',''), nullif(p->>'training_id',''), nullif(p->>'exam_id',''), nullif(p->>'request_id',''),
              nullif(p->>'agreement_id',''), nullif(p->>'certificate_id','')) is null then
    raise exception 'Свяжите документ с сотрудником, мероприятием, экзаменом, заявкой, соглашением или сертификатом' using errcode = 'P0015'; end if;
  v_ext := lower(regexp_replace(coalesce(p->>'file_name',''), '^.*\.([A-Za-z0-9]{1,5})$', '\1'));
  if v_ext !~ '^[a-z0-9]{1,5}$' then v_ext := 'bin'; end if;
  v_path := lower(v_type) || '/' || to_char(now(), 'YYYY') || '/' || v_id || '.' || v_ext;
  perform set_config('app.change_reason', 'Загрузка документа', true);
  insert into documents(id, doc_type, title, file_name, mime_type, size_bytes, storage_path, employee_id, training_id, exam_id,
                        request_id, agreement_id, certificate_id, expires_on, note)
  values (v_id, v_type, trim(p->>'title'), left(regexp_replace(p->>'file_name', '[\\/\x00-\x1f]', '_', 'g'), 200), v_mime,
          (p->>'size_bytes')::bigint, v_path, nullif(p->>'employee_id','')::uuid, nullif(p->>'training_id','')::uuid,
          nullif(p->>'exam_id','')::uuid, nullif(p->>'request_id','')::uuid, nullif(p->>'agreement_id','')::uuid,
          nullif(p->>'certificate_id','')::uuid, nullif(p->>'expires_on','')::date, nullif(trim(coalesce(p->>'note','')), ''));
  return jsonb_build_object('id', v_id, 'path', v_path);
end $$;

create function confirm_document(p_id uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare d documents%rowtype; v_ok boolean := true;
begin
  select * into d from documents where id = p_id;
  if not found or d.uploaded_by is distinct from auth.uid() or not can_doc(d.doc_type, true) then
    raise exception 'Документ не найден' using errcode = 'P0015'; end if;
  if to_regclass('storage.objects') is not null then
    execute 'select exists (select 1 from storage.objects where bucket_id = ''tms-documents'' and name = $1)' into v_ok using d.storage_path;
  end if;
  if not v_ok then raise exception 'Файл не загружен' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', 'Загрузка документа', true);
  update documents set status = 'UPLOADED' where id = p_id and status = 'PENDING';
end $$;

create function archive_document(p_id uuid, p_archived boolean, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare d documents%rowtype;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,HR,FINANCE}'::app_role[]);
  select * into d from documents where id = p_id;
  if not found then raise exception 'Документ не найден' using errcode = 'P0015'; end if;
  if not can_doc(d.doc_type, true) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  perform set_config('app.change_reason', req_reason(p_reason), true);
  update documents set archived_at = case when p_archived then now() end, archived_by = case when p_archived then auth.uid() end,
         archive_reason = case when p_archived then trim(p_reason) end where id = p_id;
end $$;

-- запись метаданных документа ограничена: после загрузки менять можно только название, срок действия и заметку
create function trg_documents_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if new.storage_path is distinct from old.storage_path or new.file_name is distinct from old.file_name
     or new.size_bytes is distinct from old.size_bytes or new.mime_type is distinct from old.mime_type
     or new.doc_type is distinct from old.doc_type or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'Файл и тип документа не изменяются: загрузите новый документ' using errcode = 'P0017'; end if;
  return new;
end $$;
create trigger documents_guard before update on documents for each row execute function trg_documents_guard();

revoke execute on function trg_exam_cost_fx(), trg_touch_actor(), trg_exam_sync(), trg_immutable(), trg_documents_guard() from public, anon, authenticated, service_role;
revoke execute on function certificate_status(timestamptz, date), next_exam_code(integer), doc_is_financial(text), can_doc(text, boolean),
  upsert_skill(smallint, jsonb, text), add_employee_skill(jsonb, text), create_exam(jsonb, text), update_exam(uuid, jsonb, text),
  set_exam_result(uuid, text, numeric, text, text), set_exam_cost(uuid, jsonb, text), create_certificate(jsonb, text),
  update_certificate(uuid, jsonb, text), revoke_certificate(uuid, boolean, text), upsert_goal(uuid, jsonb, text),
  register_document(jsonb), confirm_document(uuid), archive_document(uuid, boolean, text) from public, anon;
grant execute on function certificate_status(timestamptz, date), doc_is_financial(text), can_doc(text, boolean),
  upsert_skill(smallint, jsonb, text), add_employee_skill(jsonb, text), create_exam(jsonb, text), update_exam(uuid, jsonb, text),
  set_exam_result(uuid, text, numeric, text, text), set_exam_cost(uuid, jsonb, text), create_certificate(jsonb, text),
  update_certificate(uuid, jsonb, text), revoke_certificate(uuid, boolean, text), upsert_goal(uuid, jsonb, text),
  register_document(jsonb), confirm_document(uuid), archive_document(uuid, boolean, text) to authenticated;
