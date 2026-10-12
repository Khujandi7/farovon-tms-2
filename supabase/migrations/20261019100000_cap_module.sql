-- CAP: сертификация (Упр.учёт, Фин.учёт, Налоги, Право). Проходной 75; не сдал -> сотрудник возмещает 50% стоимости
-- (экзамен 800 TJS + доля курса = цена курса группы / число студентов). Сдал -> компания покрывает полностью.
create table if not exists cap_subjects(id smallserial primary key, code text unique not null, name text not null, sort_order smallint default 0);
insert into cap_subjects(code,name,sort_order) values ('MGMT','Управленческий учёт',1),('FIN','Финансовый учёт',2),('TAX','Налоги',3),('LAW','Право',4) on conflict (code) do nothing;
create table if not exists cap_groups(id bigserial primary key, subject_id smallint not null references cap_subjects(id), name text not null, start_month date,
 course_price_tjs numeric(12,2) not null default 25000, exam_fee_tjs numeric(12,2) not null default 800, pass_score numeric(5,2) not null default 75,
 repay_percent numeric(5,2) not null default 50, note text, created_at timestamptz default now(), updated_at timestamptz default now(), unique(subject_id,name));
create table if not exists cap_students(id bigserial primary key, group_id bigint not null references cap_groups(id) on delete cascade,
 employee_id uuid not null references employees(id), with_course boolean not null default true, note text, created_at timestamptz default now(), unique(group_id,employee_id));
create table if not exists cap_exam_attempts(id bigserial primary key, student_id bigint not null references cap_students(id) on delete cascade,
 attempt_no smallint not null default 1, exam_date date, score numeric(5,2), note text, created_at timestamptz default now(), unique(student_id,attempt_no));
create or replace view cap_student_calc with (security_invoker=true) as
with b as (select s.*, g.subject_id, g.name gname, g.exam_fee_tjs, g.pass_score, g.repay_percent,
  case when s.with_course then round(g.course_price_tjs / nullif(count(*) filter (where s.with_course) over (partition by s.group_id),0),2) else 0 end course_share
  from cap_students s join cap_groups g on g.id=s.group_id)
select b.id student_id, b.group_id, b.employee_id, b.subject_id, b.gname group_name, b.course_share course_share_tjs, b.exam_fee_tjs,
 b.course_share + b.exam_fee_tjs total_cost_tjs, la.score last_score, la.attempt_no last_attempt,
 case when la.score is null then null when la.score >= b.pass_score then 'PASSED' else 'FAILED' end outcome,
 case when la.score is null then null when la.score >= b.pass_score then 0 else round((b.course_share + b.exam_fee_tjs) * b.repay_percent/100,2) end repayment_tjs
from b left join lateral (select score, attempt_no from cap_exam_attempts a where a.student_id=b.id and a.score is not null order by attempt_no desc limit 1) la on true;
do $do$ declare t text; begin
 foreach t in array array['cap_subjects','cap_groups','cap_students','cap_exam_attempts'] loop
  execute format('alter table %I enable row level security', t);
  execute format('drop policy if exists %I on %I', t||'_read', t);
  execute format('drop policy if exists %I on %I', t||'_write', t);
  execute format($p$create policy %I on %I for select using (has_financial_access())$p$, t||'_read', t);
  execute format($p$create policy %I on %I for all using (app_role() = any (array['ADMIN','ACADEMY_MANAGER']::app_role[])) with check (app_role() = any (array['ADMIN','ACADEMY_MANAGER']::app_role[]))$p$, t||'_write', t);
 end loop; end $do$;
