-- Phase 3A.1 · M17: финансирование обучения — политики (правила), соглашения о финансировании, погашения.
-- Принципы: система НЕ удерживает деньги и не интегрируется с зарплатой; обязательство рассчитывается только по ПОДТВЕРЖДЁННОЙ политике
-- и при наличии договора; подтверждённая политика неизменяема (новая версия = новая политика); проверку обязательства делает ответственный сотрудник.

create table funding_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  scope text not null default 'ANY' check (scope in ('EXAM','INDIVIDUAL_EDUCATION','ANY')),
  company_coverage_percent numeric(5,2) not null check (company_coverage_percent between 0 and 100),
  currency currency_code,                       -- справочно: валюта, для которой действует политика (NULL — любая)
  effective_from date not null,
  effective_to date,
  basis text,                                   -- основание: приказ, положение, договор
  document_id uuid references documents(id),
  is_active boolean not null default true,
  confirmed_at timestamptz,
  confirmed_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  constraint funding_policies_dates_ok check (effective_to is null or effective_to >= effective_from)
);
create index funding_policies_document_idx on funding_policies (document_id);
create index funding_policies_confirmed_by_idx on funding_policies (confirmed_by);
create index funding_policies_created_by_idx on funding_policies (created_by);

-- Ответственность сотрудника по результату (pass_condition / fail_condition и другие исходы)
create table funding_policy_outcomes (
  policy_id uuid not null references funding_policies(id),
  outcome text not null check (outcome in ('PASSED','FAILED','NOT_ATTENDED','NOT_COMPLETED','COMPLETED','OTHER')),
  employee_responsibility_percent numeric(5,2) not null check (employee_responsibility_percent between 0 and 100),
  primary key (policy_id, outcome)
);

create table learning_agreements (
  id uuid primary key default gen_random_uuid(),
  canonical_id text not null unique,
  employee_id uuid not null references employees(id),
  training_id uuid references trainings(id),
  exam_id uuid references exams(id),
  policy_id uuid references funding_policies(id),
  contract_document_id uuid references documents(id),
  contract_number text,
  contract_date date,
  total_cost numeric(14,2) not null check (total_cost >= 0),
  currency currency_code not null default 'TJS',
  cost_date date not null default current_date,
  fx_rate numeric(18,6),
  fx_date date,
  total_cost_tjs numeric(14,2),
  company_coverage_percent numeric(5,2) not null check (company_coverage_percent between 0 and 100),
  company_funded_amount numeric(14,2) not null default 0,
  conditions text,
  pass_condition text,
  fail_condition text,
  outcome text,
  employee_responsibility_percent numeric(5,2) check (employee_responsibility_percent between 0 and 100),
  repayment_amount numeric(14,2) not null default 0 check (repayment_amount >= 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED','OBLIGATION_CREATED','PARTIALLY_REPAID','REPAID','CANCELLED')),
  effective_from date,
  effective_to date,
  evaluated_at timestamptz,
  evaluated_by uuid references profiles(id),
  reviewed_at timestamptz,
  reviewed_by uuid references profiles(id),
  review_note text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references profiles(id),
  constraint agreements_target check (training_id is not null or exam_id is not null),
  constraint agreements_dates_ok check (effective_to is null or effective_from is null or effective_to >= effective_from)
);
create index agreements_employee_idx on learning_agreements (employee_id);
create index agreements_training_idx on learning_agreements (training_id);
create index agreements_exam_idx on learning_agreements (exam_id);
create index agreements_policy_idx on learning_agreements (policy_id);
create index agreements_document_idx on learning_agreements (contract_document_id);
create index agreements_status_idx on learning_agreements (status);
create index agreements_evaluated_by_idx on learning_agreements (evaluated_by);
create index agreements_reviewed_by_idx on learning_agreements (reviewed_by);
create index agreements_created_by_idx on learning_agreements (created_by);
create index agreements_updated_by_idx on learning_agreements (updated_by);
alter table documents add constraint documents_agreement_fk foreign key (agreement_id) references learning_agreements(id);

create table agreement_repayments (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references learning_agreements(id),
  amount numeric(14,2) not null check (amount > 0),
  paid_on date not null,
  comment text,
  created_at timestamptz not null default now(),
  created_by uuid references profiles(id) default auth.uid(),
  voided_at timestamptz,
  void_reason text
);
create index repayments_agreement_idx on agreement_repayments (agreement_id);
create index repayments_created_by_idx on agreement_repayments (created_by);

create function next_agreement_code(p_year integer) returns text language plpgsql
set search_path = public, pg_temp as $$
declare n integer;
begin
  perform pg_advisory_xact_lock(hashtext('agreement_code'));
  select coalesce(max(substring(canonical_id from '^AGR-' || p_year || '-(\d+)$')::int), 0) + 1 into n
    from learning_agreements where canonical_id like 'AGR-' || p_year || '-%';
  return 'AGR-' || p_year || '-' || lpad(n::text, 3, '0');
end $$;

-- ---------- Защита неизменяемости ----------
create function trg_policy_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'Политику нельзя удалить: отключите её' using errcode = 'P0017'; end if;
  if old.confirmed_at is not null and (
       new.company_coverage_percent is distinct from old.company_coverage_percent or new.scope is distinct from old.scope
    or new.effective_from is distinct from old.effective_from or new.name is distinct from old.name
    or new.confirmed_at is distinct from old.confirmed_at or new.confirmed_by is distinct from old.confirmed_by
    or new.basis is distinct from old.basis or new.currency is distinct from old.currency
    or (new.effective_to is distinct from old.effective_to and new.effective_to is not null
        and old.effective_to is not null and new.effective_to > old.effective_to)) then
    raise exception 'Подтверждённая политика неизменяема: создайте новую версию' using errcode = 'P0017'; end if;
  return new;
end $$;
create trigger funding_policies_guard before update or delete on funding_policies for each row execute function trg_policy_guard();

create function trg_policy_outcome_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare v_pid uuid := coalesce(new.policy_id, old.policy_id);
begin
  if exists (select 1 from funding_policies where id = v_pid and confirmed_at is not null) then
    raise exception 'Подтверждённая политика неизменяема: создайте новую версию' using errcode = 'P0017'; end if;
  return coalesce(new, old);
end $$;
create trigger funding_outcomes_guard before insert or update or delete on funding_policy_outcomes for each row execute function trg_policy_outcome_guard();

-- Курс стоимости — тот же механизм fx_rates, что у расходов
create function trg_agreement_prepare() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare r record;
begin
  if tg_op = 'INSERT' or new.total_cost is distinct from old.total_cost or new.currency is distinct from old.currency
     or new.cost_date is distinct from old.cost_date then
    select * into r from fx_rate_on(new.currency, new.cost_date);
    new.fx_rate := r.rate; new.fx_date := r.rate_date; new.total_cost_tjs := round(new.total_cost * r.rate, 2);
  end if;
  new.company_funded_amount := round(new.total_cost * new.company_coverage_percent / 100, 2);
  new.updated_at := now(); new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    -- условия фиксируются после расчёта; статус и расчётные поля меняют только RPC
    if (new.status is distinct from old.status or new.outcome is distinct from old.outcome
        or new.employee_responsibility_percent is distinct from old.employee_responsibility_percent
        or new.repayment_amount is distinct from old.repayment_amount or new.evaluated_at is distinct from old.evaluated_at
        or new.reviewed_at is distinct from old.reviewed_at)
       and current_setting('app.agreement_op', true) is distinct from 'yes' then
      raise exception 'Статус и расчёт обязательства меняются только через процесс оценки' using errcode = 'P0017'; end if;
    if old.evaluated_at is not null and (
         new.employee_id is distinct from old.employee_id or new.training_id is distinct from old.training_id
      or new.exam_id is distinct from old.exam_id or new.policy_id is distinct from old.policy_id
      or new.total_cost is distinct from old.total_cost or new.currency is distinct from old.currency
      or new.cost_date is distinct from old.cost_date or new.company_coverage_percent is distinct from old.company_coverage_percent) then
      raise exception 'Условия соглашения зафиксированы после расчёта: создайте новое соглашение' using errcode = 'P0017'; end if;
  end if;
  return new;
end $$;
create trigger agreements_prepare before insert or update on learning_agreements for each row execute function trg_agreement_prepare();

create function trg_repayment_guard() returns trigger language plpgsql
set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then raise exception 'Погашение нельзя удалить: аннулируйте его' using errcode = 'P0017'; end if;
  if tg_op = 'UPDATE' and (new.agreement_id is distinct from old.agreement_id or new.amount is distinct from old.amount
       or new.paid_on is distinct from old.paid_on or new.comment is distinct from old.comment or new.created_at is distinct from old.created_at
       or (old.voided_at is not null and new.voided_at is distinct from old.voided_at)) then
    raise exception 'Погашение неизменяемо: аннулируйте и внесите заново' using errcode = 'P0017'; end if;
  return new;
end $$;
create trigger repayments_guard before update or delete on agreement_repayments for each row execute function trg_repayment_guard();

-- Статус по погашениям
create function trg_repayment_status() returns trigger language plpgsql
set search_path = public, pg_temp as $$
declare a learning_agreements%rowtype; v_paid numeric;
begin
  select * into a from learning_agreements where id = new.agreement_id for update;
  select coalesce(sum(amount), 0) into v_paid from agreement_repayments where agreement_id = a.id and voided_at is null;
  perform set_config('app.agreement_op', 'yes', true);
  update learning_agreements set status = case when v_paid >= a.repayment_amount and a.repayment_amount > 0 then 'REPAID'
                                               when v_paid > 0 then 'PARTIALLY_REPAID' else 'OBLIGATION_CREATED' end
   where id = a.id and status in ('OBLIGATION_CREATED','PARTIALLY_REPAID','REPAID');
  perform set_config('app.agreement_op', '', true);
  return new;
end $$;
create trigger repayments_status after insert or update on agreement_repayments for each row execute function trg_repayment_status();

-- ---------- Аудит и RLS ----------
create trigger audit_funding_policies after insert or update or delete on funding_policies for each row execute function trg_audit();
create trigger audit_learning_agreements after insert or update or delete on learning_agreements for each row execute function trg_audit();
create trigger audit_agreement_repayments after insert or update or delete on agreement_repayments for each row execute function trg_audit();
-- исходы политики: у таблицы нет id — ключ аудита даёт policy_id в json (row_id = пусто); отдельный аудит не нужен: исходы неизменяемы после подтверждения
alter table funding_policies enable row level security;
alter table funding_policy_outcomes enable row level security;
alter table learning_agreements enable row level security;
alter table agreement_repayments enable row level security;
-- читают ADMIN, ACADEMY_MANAGER, FINANCE (персональные финансовые обязательства; VIEWER и HR получают только агрегаты функциями)
create policy funding_policies_read on funding_policies for select to authenticated using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]));
create policy funding_policies_write on funding_policies for insert to authenticated with check (app_role() = any ('{ADMIN,FINANCE}'::app_role[]));
create policy funding_policies_update on funding_policies for update to authenticated using (app_role() = any ('{ADMIN,FINANCE}'::app_role[])) with check (app_role() = any ('{ADMIN,FINANCE}'::app_role[]));
create policy funding_outcomes_read on funding_policy_outcomes for select to authenticated using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]));
create policy funding_outcomes_write on funding_policy_outcomes for all to authenticated using (app_role() = any ('{ADMIN,FINANCE}'::app_role[])) with check (app_role() = any ('{ADMIN,FINANCE}'::app_role[]));
create policy agreements_read on learning_agreements for select to authenticated using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]));
create policy agreements_insert on learning_agreements for insert to authenticated with check (app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]));
create policy agreements_update on learning_agreements for update to authenticated using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[])) with check (app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]));
create policy repayments_read on agreement_repayments for select to authenticated using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]));
create policy repayments_insert on agreement_repayments for insert to authenticated with check (app_role() = any ('{ADMIN,FINANCE}'::app_role[]));
create policy repayments_update on agreement_repayments for update to authenticated using (app_role() = any ('{ADMIN,FINANCE}'::app_role[])) with check (app_role() = any ('{ADMIN,FINANCE}'::app_role[]));

-- ---------- RPC ----------
create function upsert_funding_policy(p_id uuid, p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; k text; v numeric;
begin
  perform req_role('{ADMIN,FINANCE}'::app_role[]);
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Политика финансирования'), true);
  if p_id is null then
    if length(trim(coalesce(p->>'name',''))) = 0 then raise exception 'Укажите название политики' using errcode = 'P0015'; end if;
    insert into funding_policies(name, scope, company_coverage_percent, currency, effective_from, effective_to, basis, document_id)
    values (trim(p->>'name'), coalesce(nullif(p->>'scope',''), 'ANY'), (p->>'company_coverage_percent')::numeric,
            nullif(p->>'currency','')::currency_code, (p->>'effective_from')::date, nullif(p->>'effective_to','')::date,
            nullif(trim(coalesce(p->>'basis','')), ''), nullif(p->>'document_id','')::uuid)
    returning id into v_id;
  else
    update funding_policies set
      name = case when p ? 'name' then trim(p->>'name') else name end,
      scope = case when p ? 'scope' then p->>'scope' else scope end,
      company_coverage_percent = case when p ? 'company_coverage_percent' then (p->>'company_coverage_percent')::numeric else company_coverage_percent end,
      currency = case when p ? 'currency' then nullif(p->>'currency','')::currency_code else currency end,
      effective_from = case when p ? 'effective_from' then (p->>'effective_from')::date else effective_from end,
      effective_to = case when p ? 'effective_to' then nullif(p->>'effective_to','')::date else effective_to end,
      basis = case when p ? 'basis' then nullif(trim(coalesce(p->>'basis','')), '') else basis end,
      document_id = case when p ? 'document_id' then nullif(p->>'document_id','')::uuid else document_id end,
      is_active = case when p ? 'is_active' then (p->>'is_active')::boolean else is_active end
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Политика не найдена' using errcode = 'P0015'; end if;
  end if;
  if p ? 'outcomes' then
    delete from funding_policy_outcomes where policy_id = v_id;
    for k, v in select key, value::numeric from jsonb_each_text(p->'outcomes') loop
      insert into funding_policy_outcomes(policy_id, outcome, employee_responsibility_percent) values (v_id, k, v);
    end loop;
  end if;
  return v_id;
end $$;

create function confirm_funding_policy(p_id uuid, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform req_role('{ADMIN,FINANCE}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  if not exists (select 1 from funding_policy_outcomes where policy_id = p_id) then
    raise exception 'Добавьте хотя бы один исход (например, «сдан» → 0%%)' using errcode = 'P0015'; end if;
  update funding_policies set confirmed_at = now(), confirmed_by = auth.uid() where id = p_id and confirmed_at is null;
  if not found then raise exception 'Политика не найдена или уже подтверждена' using errcode = 'P0015'; end if;
end $$;

create function create_agreement(p jsonb, p_reason text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare v_id uuid; v_pol funding_policies%rowtype; v_cov numeric; v_cost numeric := nullif(p->>'total_cost','')::numeric;
        v_cur currency_code := coalesce(nullif(p->>'currency','')::currency_code, 'TJS'); v_date date := coalesce(nullif(p->>'cost_date','')::date, current_date);
        v_exam uuid := nullif(p->>'exam_id','')::uuid; v_tr uuid := nullif(p->>'training_id','')::uuid; v_emp uuid := (p->>'employee_id')::uuid;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]);
  if v_emp is null then raise exception 'Укажите сотрудника' using errcode = 'P0015'; end if;
  if v_exam is null and v_tr is null then raise exception 'Укажите экзамен или обучение' using errcode = 'P0015'; end if;
  if v_exam is not null and v_cost is null then
    select fee, currency, fee_date into v_cost, v_cur, v_date from exam_costs where exam_id = v_exam;
  end if;
  if v_cost is null or v_cost < 0 then raise exception 'Укажите стоимость' using errcode = 'P0015'; end if;
  if nullif(p->>'policy_id','') is not null then
    select * into v_pol from funding_policies where id = (p->>'policy_id')::uuid;
    if not found or v_pol.confirmed_at is null or not v_pol.is_active then
      raise exception 'Политика не подтверждена: расчёт обязательства невозможен' using errcode = 'P0015'; end if;
    if v_date < v_pol.effective_from or (v_pol.effective_to is not null and v_date > v_pol.effective_to) then
      raise exception 'Дата расходов вне срока действия политики' using errcode = 'P0015'; end if;
  end if;
  v_cov := coalesce(nullif(p->>'company_coverage_percent','')::numeric, v_pol.company_coverage_percent);
  if v_cov is null then raise exception 'Укажите долю компании или выберите политику' using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Создание соглашения'), true);
  insert into learning_agreements(canonical_id, employee_id, training_id, exam_id, policy_id, contract_document_id, contract_number,
        contract_date, total_cost, currency, cost_date, company_coverage_percent, conditions, pass_condition, fail_condition,
        effective_from, effective_to, note)
  values (next_agreement_code(extract(year from v_date)::int), v_emp, v_tr, v_exam, nullif(p->>'policy_id','')::uuid,
          nullif(p->>'contract_document_id','')::uuid, nullif(trim(coalesce(p->>'contract_number','')), ''),
          nullif(p->>'contract_date','')::date, v_cost, v_cur, v_date, v_cov,
          nullif(trim(coalesce(p->>'conditions','')), ''), nullif(trim(coalesce(p->>'pass_condition','')), ''),
          nullif(trim(coalesce(p->>'fail_condition','')), ''), nullif(p->>'effective_from','')::date,
          nullif(p->>'effective_to','')::date, nullif(trim(coalesce(p->>'note','')), ''))
  returning id into v_id;
  return v_id;
end $$;

create function update_agreement(p_id uuid, p_patch jsonb, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare k text; a learning_agreements%rowtype;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]);
  select * into a from learning_agreements where id = p_id for update;
  if not found then raise exception 'Соглашение не найдено' using errcode = 'P0015'; end if;
  if a.status = 'CANCELLED' then raise exception 'Соглашение отменено' using errcode = 'P0015'; end if;
  for k in select jsonb_object_keys(p_patch) loop
    if k not in ('contract_document_id','contract_number','contract_date','conditions','pass_condition','fail_condition',
                 'effective_from','effective_to','note','total_cost','currency','cost_date','company_coverage_percent') then
      raise exception 'Поле «%» нельзя менять', k using errcode = 'P0015'; end if;
  end loop;
  perform set_config('app.change_reason', req_reason(p_reason), true);
  update learning_agreements set
    contract_document_id = case when p_patch ? 'contract_document_id' then nullif(p_patch->>'contract_document_id','')::uuid else contract_document_id end,
    contract_number = case when p_patch ? 'contract_number' then nullif(trim(coalesce(p_patch->>'contract_number','')), '') else contract_number end,
    contract_date = case when p_patch ? 'contract_date' then nullif(p_patch->>'contract_date','')::date else contract_date end,
    conditions = case when p_patch ? 'conditions' then nullif(trim(coalesce(p_patch->>'conditions','')), '') else conditions end,
    pass_condition = case when p_patch ? 'pass_condition' then nullif(trim(coalesce(p_patch->>'pass_condition','')), '') else pass_condition end,
    fail_condition = case when p_patch ? 'fail_condition' then nullif(trim(coalesce(p_patch->>'fail_condition','')), '') else fail_condition end,
    effective_from = case when p_patch ? 'effective_from' then nullif(p_patch->>'effective_from','')::date else effective_from end,
    effective_to = case when p_patch ? 'effective_to' then nullif(p_patch->>'effective_to','')::date else effective_to end,
    note = case when p_patch ? 'note' then nullif(trim(coalesce(p_patch->>'note','')), '') else note end,
    total_cost = case when p_patch ? 'total_cost' then (p_patch->>'total_cost')::numeric else total_cost end,
    currency = case when p_patch ? 'currency' then (p_patch->>'currency')::currency_code else currency end,
    cost_date = case when p_patch ? 'cost_date' then (p_patch->>'cost_date')::date else cost_date end,
    company_coverage_percent = case when p_patch ? 'company_coverage_percent' then (p_patch->>'company_coverage_percent')::numeric else company_coverage_percent end
  where id = p_id;
end $$;

create function cancel_agreement(p_id uuid, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_n integer;
begin
  perform req_role('{ADMIN,FINANCE}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  if exists (select 1 from agreement_repayments where agreement_id = p_id and voided_at is null) then
    raise exception 'Есть погашения: сначала аннулируйте их' using errcode = 'P0015'; end if;
  perform set_config('app.agreement_op', 'yes', true);
  update learning_agreements set status = 'CANCELLED' where id = p_id and status <> 'CANCELLED';
  get diagnostics v_n = row_count;
  perform set_config('app.agreement_op', '', true);
  if v_n = 0 then raise exception 'Соглашение не найдено или уже отменено' using errcode = 'P0015'; end if;
end $$;

-- Расчёт обязательства. Только по подтверждённой политике, действующей на дату расходов, и при наличии договора (номер или файл).
-- Результат берётся из экзамена (попытки) или из результата участника обучения. Деньги не списываются: создаётся обязательство «на проверку».
create function evaluate_agreement(p_id uuid, p_reason text default null) returns jsonb
language plpgsql set search_path = public, pg_temp as $$
declare a learning_agreements%rowtype; pol funding_policies%rowtype; v_outcome text; v_pct numeric; v_amount numeric; v_status text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]);
  select * into a from learning_agreements where id = p_id for update;
  if not found then raise exception 'Соглашение не найдено' using errcode = 'P0015'; end if;
  if a.status = 'CANCELLED' then raise exception 'Соглашение отменено' using errcode = 'P0015'; end if;
  if exists (select 1 from agreement_repayments where agreement_id = p_id and voided_at is null) then
    raise exception 'Есть погашения: пересчёт невозможен' using errcode = 'P0015'; end if;
  if a.policy_id is null then raise exception 'Нет подтверждённой политики: требуется проверка ответственным сотрудником' using errcode = 'P0015'; end if;
  select * into pol from funding_policies where id = a.policy_id;
  if pol.confirmed_at is null or not pol.is_active then
    raise exception 'Политика не подтверждена: требуется проверка ответственным сотрудником' using errcode = 'P0015'; end if;
  if a.contract_number is null and a.contract_document_id is null then
    raise exception 'Нет договора: прикрепите договор или укажите его номер' using errcode = 'P0015'; end if;
  if a.exam_id is not null then
    select result into v_outcome from exams where id = a.exam_id;
  else
    select result into v_outcome from training_participants where training_id = a.training_id and employee_id = a.employee_id;
  end if;
  if v_outcome is null or v_outcome = 'PENDING' then
    raise exception 'Результат ещё не внесён: расчёт невозможен' using errcode = 'P0015'; end if;
  select employee_responsibility_percent into v_pct from funding_policy_outcomes where policy_id = pol.id and outcome = v_outcome;
  if v_pct is null then
    raise exception 'В политике нет правила для результата «%»: требуется проверка ответственным сотрудником', v_outcome using errcode = 'P0015'; end if;
  v_amount := round(a.total_cost * v_pct / 100, 2);
  v_status := case when v_amount > 0 then 'OBLIGATION_CREATED' else 'COMPLETED' end;
  perform set_config('app.change_reason', coalesce(nullif(trim(coalesce(p_reason,'')), ''), 'Расчёт по результату: ' || v_outcome), true);
  perform set_config('app.agreement_op', 'yes', true);
  update learning_agreements set outcome = v_outcome, employee_responsibility_percent = v_pct, repayment_amount = v_amount,
         status = v_status, evaluated_at = now(), evaluated_by = auth.uid(), reviewed_at = null, reviewed_by = null, review_note = null
   where id = p_id;
  perform set_config('app.agreement_op', '', true);
  return jsonb_build_object('outcome', v_outcome, 'employee_responsibility_percent', v_pct, 'repayment_amount', v_amount, 'status', v_status,
                            'needs_review', v_amount > 0);
end $$;

create function review_obligation(p_id uuid, p_note text, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_n integer;
begin
  perform req_role('{ADMIN,FINANCE}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  perform set_config('app.agreement_op', 'yes', true);
  update learning_agreements set reviewed_at = now(), reviewed_by = auth.uid(), review_note = nullif(trim(coalesce(p_note,'')), '')
   where id = p_id and status in ('OBLIGATION_CREATED','PARTIALLY_REPAID','REPAID') and reviewed_at is null;
  get diagnostics v_n = row_count;
  perform set_config('app.agreement_op', '', true);
  if v_n = 0 then raise exception 'Нет обязательства для проверки' using errcode = 'P0015'; end if;
end $$;

create function record_repayment(p_agreement uuid, p_amount numeric, p_paid_on date, p_comment text default null) returns uuid
language plpgsql set search_path = public, pg_temp as $$
declare a learning_agreements%rowtype; v_paid numeric; v_id uuid;
begin
  perform req_role('{ADMIN,FINANCE}'::app_role[]);
  select * into a from learning_agreements where id = p_agreement for update;
  if not found then raise exception 'Соглашение не найдено' using errcode = 'P0015'; end if;
  if a.status not in ('OBLIGATION_CREATED','PARTIALLY_REPAID') or a.reviewed_at is null then
    raise exception 'Погашение возможно только по проверенному обязательству' using errcode = 'P0015'; end if;
  select coalesce(sum(amount), 0) into v_paid from agreement_repayments where agreement_id = a.id and voided_at is null;
  if p_amount is null or p_amount <= 0 or v_paid + p_amount > a.repayment_amount then
    raise exception 'Сумма погашения должна быть больше 0 и не превышать остаток (%)', a.repayment_amount - v_paid using errcode = 'P0015'; end if;
  perform set_config('app.change_reason', 'Погашение', true);
  insert into agreement_repayments(agreement_id, amount, paid_on, comment) values (a.id, p_amount, coalesce(p_paid_on, current_date), nullif(trim(coalesce(p_comment,'')), ''))
  returning id into v_id;
  return v_id;
end $$;

create function void_repayment(p_id uuid, p_reason text) returns void
language plpgsql set search_path = public, pg_temp as $$
begin
  perform req_role('{ADMIN,FINANCE}'::app_role[]);
  perform set_config('app.change_reason', req_reason(p_reason), true);
  update agreement_repayments set voided_at = now(), void_reason = trim(p_reason) where id = p_id and voided_at is null;
  if not found then raise exception 'Погашение не найдено или уже аннулировано' using errcode = 'P0015'; end if;
end $$;

revoke execute on function trg_policy_guard(), trg_policy_outcome_guard(), trg_agreement_prepare(), trg_repayment_guard(), trg_repayment_status()
  from public, anon, authenticated, service_role;
revoke execute on function next_agreement_code(integer), upsert_funding_policy(uuid, jsonb, text), confirm_funding_policy(uuid, text),
  create_agreement(jsonb, text), update_agreement(uuid, jsonb, text), cancel_agreement(uuid, text), evaluate_agreement(uuid, text),
  review_obligation(uuid, text, text), record_repayment(uuid, numeric, date, text), void_repayment(uuid, text) from public, anon;
grant execute on function upsert_funding_policy(uuid, jsonb, text), confirm_funding_policy(uuid, text),
  create_agreement(jsonb, text), update_agreement(uuid, jsonb, text), cancel_agreement(uuid, text), evaluate_agreement(uuid, text),
  review_obligation(uuid, text, text), record_repayment(uuid, numeric, date, text), void_repayment(uuid, text) to authenticated;
