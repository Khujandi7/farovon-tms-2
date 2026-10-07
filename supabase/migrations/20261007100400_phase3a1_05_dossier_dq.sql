-- Phase 3A.1 · M18: досье сотрудника (сводка, лента, затраты), расширенный аудит, правила Data Quality.


-- ---------- Аудит: сущности досье ----------
create or replace function entity_audit(p_table text, p_id uuid, p_limit integer default 200)
returns table(id bigint, at timestamptz, user_id uuid, user_name text, table_name text, row_id text, action text, reason text, old_row jsonb, new_row jsonb, changes jsonb)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_role app_role := app_role(); v_fin boolean; v_agr boolean;
begin
  if v_role is null then raise exception 'Нет доступа' using errcode = '42501'; end if;
  if p_table not in ('trainings','training_requests','employees','exams','certificates','learning_agreements') then
    raise exception 'Неподдерживаемая сущность: %', p_table;
  end if;
  v_fin := v_role = any ('{ADMIN,ACADEMY_MANAGER,FINANCE,VIEWER}'::app_role[]);
  v_agr := v_role = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]);
  return query
  select a.id, a.at, a.user_id, pr.full_name, a.table_name, a.row_id, a.action, a.reason, a.old_row, a.new_row,
         case when a.action = 'UPDATE' then
                (select coalesce(jsonb_object_agg(k, jsonb_build_array(a.old_row->k, a.new_row->k)), '{}'::jsonb)
                   from jsonb_object_keys(a.new_row) k
                  where a.old_row->k is distinct from a.new_row->k and k not in ('updated_at','updated_by','marked_at'))
              when a.action = 'INSERT' then a.new_row else a.old_row end
    from audit_log a
    left join profiles pr on pr.id = a.user_id
   where (
          (a.table_name = p_table and a.row_id = p_id::text and (p_table <> 'learning_agreements' or v_agr))
       or (p_table = 'trainings' and (
              (a.table_name in ('training_sessions','training_participants','training_trainers')
                 and coalesce(a.new_row, a.old_row)->>'training_id' = p_id::text)
           or (a.table_name = 'expense_operations' and v_fin
                 and coalesce(a.new_row, a.old_row)->>'training_id' = p_id::text)
           or (a.table_name = 'learning_agreements' and v_agr and coalesce(a.new_row, a.old_row)->>'training_id' = p_id::text)
           or (a.table_name = 'documents' and coalesce(a.new_row, a.old_row)->>'training_id' = p_id::text
                 and can_doc(coalesce(a.new_row, a.old_row)->>'doc_type', false))
           or (a.table_name = 'session_attendance' and exists (
                 select 1 from training_participants tp
                  where tp.id::text = coalesce(a.new_row, a.old_row)->>'participant_id' and tp.training_id = p_id))
           or (a.table_name = 'session_attendance' and not exists (
                 select 1 from training_participants tp
                  where tp.id::text = coalesce(a.new_row, a.old_row)->>'participant_id')
               and exists (select 1 from training_sessions ts
                  where ts.id::text = coalesce(a.new_row, a.old_row)->>'session_id' and ts.training_id = p_id))))
       or (p_table = 'employees' and (
              (a.table_name in ('employee_aliases','employee_skills','certificates','exams','development_goals')
                 and coalesce(a.new_row, a.old_row)->>'employee_id' = p_id::text)
           or (a.table_name = 'training_participants' and coalesce(a.new_row, a.old_row)->>'employee_id' = p_id::text)
           or (a.table_name = 'learning_agreements' and v_agr and coalesce(a.new_row, a.old_row)->>'employee_id' = p_id::text)
           or (a.table_name = 'documents' and coalesce(a.new_row, a.old_row)->>'employee_id' = p_id::text
                 and can_doc(coalesce(a.new_row, a.old_row)->>'doc_type', false))
           or (a.table_name = 'exam_costs' and v_fin and exists (
                 select 1 from exams x where x.id::text = coalesce(a.new_row, a.old_row)->>'exam_id' and x.employee_id = p_id))))
       or (p_table = 'exams' and (
              (a.table_name = 'exam_costs' and v_fin and coalesce(a.new_row, a.old_row)->>'exam_id' = p_id::text)
           or (a.table_name = 'learning_agreements' and v_agr and coalesce(a.new_row, a.old_row)->>'exam_id' = p_id::text)
           or (a.table_name = 'documents' and coalesce(a.new_row, a.old_row)->>'exam_id' = p_id::text
                 and can_doc(coalesce(a.new_row, a.old_row)->>'doc_type', false))))
       or (p_table = 'learning_agreements' and v_agr and a.table_name = 'agreement_repayments'
             and coalesce(a.new_row, a.old_row)->>'agreement_id' = p_id::text)
         )
   order by a.at desc, a.id desc
   limit greatest(least(p_limit, 1000), 1);
end $$;

-- ---------- Досье сотрудника ----------
-- Роли для обязательств сотрудника (персональные финансовые данные) уже ограничены RLS: функции выполняются с правами вызывающего.
create function employee_learning_summary(p_employee uuid) returns table(
  events_count integer, man_hours numeric, planned_count integer, unplanned_count integer,
  exams_passed integer, exams_failed integer, exams_total integer, certificates_active integer, certificates_total integer,
  company_spent_tjs numeric, individual_education_tjs numeric, employee_obligation_tjs numeric, outstanding_obligation_tjs numeric)
language sql stable set search_path = public, pg_temp as $$
  with ev as (select * from employee_dossier(p_employee)),
  ind as (select coalesce(sum(actual_total(t.id)), 0) s
            from training_participants p join trainings t on t.id = p.training_id join learning_event_types et on et.id = t.event_type_id
           where p.employee_id = p_employee and not et.is_group and t.archived_at is null),
  ex as (select e.result, c.fee_tjs, c.funding_source from exams e left join exam_costs c on c.exam_id = e.id
          where e.employee_id = p_employee and e.archived_at is null),
  ag as (select a.id, a.repayment_amount * coalesce(a.total_cost_tjs / nullif(a.total_cost, 0), 1) as obligation_tjs,
                (a.repayment_amount - coalesce((select sum(r.amount) from agreement_repayments r where r.agreement_id = a.id and r.voided_at is null), 0))
                  * coalesce(a.total_cost_tjs / nullif(a.total_cost, 0), 1) as outstanding_tjs
           from learning_agreements a where a.employee_id = p_employee and a.status in ('OBLIGATION_CREATED','PARTIALLY_REPAID','REPAID'))
  select (select count(*)::int from ev),
         (select coalesce(sum(hours), 0) from ev),
         (select count(*)::int from ev where source_type = 'PLANNED'),
         (select count(*)::int from ev where source_type = 'UNPLANNED'),
         (select count(*)::int from ex where result = 'PASSED'),
         (select count(*)::int from ex where result = 'FAILED'),
         (select count(*)::int from ex where result <> 'PENDING'),
         (select count(*)::int from v_certificates where employee_id = p_employee and archived_at is null and status in ('ACTIVE','NO_EXPIRATION')),
         (select count(*)::int from certificates where employee_id = p_employee and archived_at is null),
         case when has_financial_access() then (select coalesce(sum(cost_share_tjs), 0) from ev) + (select coalesce(sum(fee_tjs), 0) from ex where funding_source in ('COMPANY','SHARED')) end,
         case when has_financial_access() then (select s from ind) end,
         (select case when app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]) then round(coalesce(sum(obligation_tjs), 0), 2) end from ag),
         (select case when app_role() = any ('{ADMIN,ACADEMY_MANAGER,FINANCE}'::app_role[]) then round(coalesce(sum(outstanding_tjs), 0), 2) end from ag)
$$;


-- Хронология развития: объединяет обучение, экзамены, сертификаты, договоры, навыки и цели. Под RLS вызывающего.
create function employee_timeline(p_employee uuid) returns table(event_date date, kind text, title text, detail text, status text, ref_table text, ref_id uuid)
language sql stable set search_path = public, pg_temp as $$
  select d.start_date, 'EVENT', d.title, et.name || ' · ' || coalesce(d.hours::text, '') || ' ч', null, 'trainings', d.training_id
    from employee_dossier(p_employee) d join trainings t on t.id = d.training_id join learning_event_types et on et.id = t.event_type_id
  union all
  select x.exam_date, 'EXAM', s.name || ' — попытка ' || x.attempt_no, x.canonical_id, x.result, 'exams', x.id
    from exams x join skills s on s.id = x.skill_id where x.employee_id = p_employee and x.archived_at is null
  union all
  select coalesce(c.issue_date, c.created_at::date), 'CERTIFICATE', c.name, coalesce(c.issuing_organization, ''), certificate_status(c.revoked_at, c.expiration_date), 'certificates', c.id
    from certificates c where c.employee_id = p_employee and c.archived_at is null
  union all
  select coalesce(a.contract_date, a.created_at::date), 'AGREEMENT', 'Соглашение ' || a.canonical_id, coalesce(a.contract_number, ''), a.status, 'learning_agreements', a.id
    from learning_agreements a where a.employee_id = p_employee
  union all
  select k.achieved_on, 'SKILL', s.name || ' — ' || k.level, coalesce(k.note, ''), null, 'employee_skills', k.id
    from employee_skills k join skills s on s.id = k.skill_id where k.employee_id = p_employee
  union all
  select g.completed_at::date, 'GOAL', g.title, 'План развития ' || g.plan_year, g.status, 'development_goals', g.id
    from development_goals g where g.employee_id = p_employee and g.status = 'COMPLETED' and g.completed_at is not null
  order by 1 desc, 2
$$;

revoke execute on function employee_learning_summary(uuid), employee_timeline(uuid) from public, anon;
grant execute on function employee_learning_summary(uuid), employee_timeline(uuid) to authenticated;

-- ---------- Data Quality: новые правила ----------
create or replace function dq_scan() returns table(opened integer, auto_fixed integer, total_open integer)
language plpgsql set search_path = public, pg_temp as $$
declare n_new integer; n_fixed integer;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  create temp table _dq_found(rule_code text, severity dq_severity, entity_table text, entity_id text,
                              message text, suggestion text, details jsonb) on commit drop;

  -- тренинг проведён, а участников нет
  insert into _dq_found
  select 'TRAINING_NO_PARTICIPANTS', 'WARNING', 'trainings', t.id::text,
         'У тренинга «' || t.title || '» нет участников.',
         'Добавьте участников или по подразделению; если тренинг не проводился — смените статус.',
         jsonb_build_object('training_id', t.id, 'status', t.status)
    from trainings t
   where t.archived_at is null and t.status in ('COMPLETED','IN_PROGRESS')
     and not exists (select 1 from training_participants p where p.training_id = t.id);

  -- завершён, но дата окончания в будущем
  insert into _dq_found
  select 'TRAINING_DONE_IN_FUTURE', 'ERROR', 'trainings', t.id::text,
         'Тренинг «' || t.title || '» отмечен как завершённый, но дата окончания ' || t.end_date || ' ещё не наступила.',
         'Проверьте дату окончания или статус.',
         jsonb_build_object('training_id', t.id, 'end_date', t.end_date, 'status', t.status)
    from trainings t
   where t.archived_at is null and t.status = 'COMPLETED' and t.end_date > current_date;

  -- запланирован, но дата уже прошла
  insert into _dq_found
  select 'TRAINING_PLANNED_IN_PAST', 'WARNING', 'trainings', t.id::text,
         'Мероприятие «' || t.title || '» всё ещё в статусе «' || t.status || '», хотя дата окончания ' || t.end_date || ' прошла.',
         'Укажите фактический статус: проведён, отменён, перенесён или не состоялся.',
         jsonb_build_object('training_id', t.id, 'end_date', t.end_date, 'status', t.status)
    from trainings t
   where t.archived_at is null and t.status::text in ('DRAFT','PLANNED','APPROVED','REGISTERED') and t.end_date < current_date;

  -- часы тренинга не равны сумме часов заходов
  insert into _dq_found
  select 'TRAINING_HOURS_MISMATCH', 'WARNING', 'trainings', t.id::text,
         'Часы тренинга (' || t.hours || ') не равны сумме часов заходов (' || s.h || ').',
         'Исправьте часы заходов: часы тренинга считаются по ним.',
         jsonb_build_object('training_id', t.id, 'plan', t.hours, 'fact', s.h)
    from trainings t
    join (select training_id, sum(hours) h from training_sessions group by training_id) s on s.training_id = t.id
   where t.archived_at is null and t.hours <> s.h;

  -- план/факт по участникам (только проведённые)
  insert into _dq_found
  select 'PARTICIPANTS_PLAN_VS_FACT', 'INFO', 'trainings', t.id::text,
         'Участников по плану ' || t.participants_planned || ', по факту ' || participants_count(t.id) || '.',
         'Если расхождение объяснимо, подтвердите «Оставить как есть».',
         jsonb_build_object('training_id', t.id, 'plan', t.participants_planned, 'fact', participants_count(t.id))
    from trainings t
   where t.archived_at is null and t.status = 'COMPLETED' and t.participants_planned is not null
     and participants_count(t.id) <> t.participants_planned;

  -- существующая логика PLANNED/UNPLANNED (Phase 1)
  insert into _dq_found
  select v.rule_code, v.severity, 'trainings', v.entity_id, v.message,
         case v.rule_code when 'SRC_PLANNED_NO_REQUEST' then 'Свяжите тренинг с заявкой или измените тип на внеплановый.'
                          else 'Подтвердите внеплановый тренинг или свяжите его с заявкой.' end,
         jsonb_build_object('training_id', v.entity_id)
    from v_dq_source_logic v
    join trainings t on t.id::text = v.entity_id and t.archived_at is null;

  -- заявка выполнена/запланирована, а тренинга нет
  insert into _dq_found
  select 'REQUEST_NO_TRAINING', 'WARNING', 'training_requests', r.id::text,
         'Заявка ' || r.canonical_id || ' («' || r.topic || '») в статусе ' || r.status || ', но тренинг не привязан.',
         'Привяжите тренинг к заявке или смените статус заявки.',
         jsonb_build_object('request_id', r.id, 'status', r.status)
    from training_requests r
   where r.archived_at is null and r.status in ('PLANNED','DONE')
     and not exists (select 1 from trainings t where t.request_id = r.id and t.archived_at is null);

  -- дубли ФИО в справочнике сотрудников
  insert into _dq_found
  select 'EMPLOYEE_DUPLICATE_NAME', 'WARNING', 'employees', e.id::text,
         'В справочнике несколько сотрудников с одним ФИО: ' || e.full_name || '.',
         'Откройте карточки и уточните данные. Автоматического слияния нет.',
         jsonb_build_object('employee_id', e.id, 'name_norm', e.name_norm)
    from employees e
   where e.is_active and e.name_norm in (select name_norm from employees where is_active group by name_norm having count(*) > 1);

  -- активный сотрудник без подразделения
  insert into _dq_found
  select 'EMPLOYEE_NO_UNIT', 'INFO', 'employees', e.id::text,
         'У сотрудника ' || e.full_name || ' не указано подразделение.',
         'Выберите департамент и отдел.',
         jsonb_build_object('employee_id', e.id)
    from employees e where e.is_active and e.department_id is null and e.unit_id is null;


  -- ===== Phase 3A.1 =====
  -- два сотрудника с одним ФИО среди участников одного мероприятия (вероятный дубль человека)
  insert into _dq_found
  select 'PARTICIPANT_DUPLICATE_PERSON', 'WARNING', 'trainings', t.id::text,
         'В «' || t.title || '» участвуют двое с одинаковым ФИО: ' || x.full_name || '.',
         'Проверьте, не дублируется ли сотрудник в справочнике, и уберите лишнего участника.',
         jsonb_build_object('training_id', t.id, 'name_norm', x.name_norm)
    from trainings t
    join (select p.training_id, e.name_norm, min(e.full_name) full_name from training_participants p join employees e on e.id = p.employee_id
           group by p.training_id, e.name_norm having count(*) > 1) x on x.training_id = t.id
   where t.archived_at is null;

  insert into _dq_found
  select case when c.expiration_date < current_date then 'CERT_EXPIRED' else 'CERT_EXPIRING' end,
         case when c.expiration_date < current_date then 'WARNING' else 'INFO' end::dq_severity, 'certificates', c.id::text,
         case when c.expiration_date < current_date then 'Сертификат «' || c.name || '» (' || e.full_name || ') истёк ' || c.expiration_date || '.'
              else 'Сертификат «' || c.name || '» (' || e.full_name || ') истекает ' || c.expiration_date || '.' end,
         'Продлите сертификат или обновите срок действия; отозванные и архивные не проверяются.',
         jsonb_build_object('certificate_id', c.id, 'employee_id', c.employee_id, 'expiration_date', c.expiration_date)
    from certificates c join employees e on e.id = c.employee_id
   where c.archived_at is null and c.revoked_at is null and c.expiration_date is not null
     and c.expiration_date <= current_date + 30;

  insert into _dq_found
  select 'EXAM_NO_RESULT', 'WARNING', 'exams', x.id::text,
         'У экзамена ' || x.canonical_id || ' (' || e.full_name || ', ' || s.name || ') дата прошла, результата нет.',
         'Внесите результат: сдан, не сдан, не явился или другой.',
         jsonb_build_object('exam_id', x.id, 'employee_id', x.employee_id, 'exam_date', x.exam_date)
    from exams x join employees e on e.id = x.employee_id join skills s on s.id = x.skill_id
   where x.archived_at is null and x.status = 'SCHEDULED' and x.result = 'PENDING' and x.exam_date < current_date;

  insert into _dq_found
  select 'EXAM_PASSED_NO_CERT', 'INFO', 'exams', x.id::text,
         'Экзамен ' || x.canonical_id || ' сдан (' || e.full_name || ', ' || s.name || '), сертификат не добавлен.',
         'Добавьте сертификат или подтвердите, что он не выдаётся.',
         jsonb_build_object('exam_id', x.id, 'employee_id', x.employee_id)
    from exams x join employees e on e.id = x.employee_id join skills s on s.id = x.skill_id
   where x.archived_at is null and x.result = 'PASSED'
     and not exists (select 1 from certificates c where c.exam_id = x.id and c.archived_at is null);

  -- финансирование без договора (экзамен с оплатой компании)
  insert into _dq_found
  select 'FUNDING_NO_CONTRACT', 'WARNING', 'exams', x.id::text,
         'Экзамен ' || x.canonical_id || ' (' || e.full_name || ') оплачен компанией, договора нет.',
         'Создайте соглашение о финансировании и прикрепите договор.',
         jsonb_build_object('exam_id', x.id, 'employee_id', x.employee_id)
    from exams x join exam_costs c on c.exam_id = x.id join employees e on e.id = x.employee_id
   where x.archived_at is null and c.funding_source in ('COMPANY','SHARED') and c.fee > 0
     and not exists (select 1 from learning_agreements a where a.exam_id = x.id and a.status <> 'CANCELLED'
                       and (a.contract_number is not null or a.contract_document_id is not null))
     and not exists (select 1 from documents d where d.exam_id = x.id and d.doc_type in ('CONTRACT','AGREEMENT') and d.archived_at is null);

  insert into _dq_found
  select 'AGREEMENT_NO_CONTRACT', 'WARNING', 'learning_agreements', a.id::text,
         'В соглашении ' || a.canonical_id || ' нет договора (ни файла, ни номера).',
         'Прикрепите договор или укажите его номер.',
         jsonb_build_object('agreement_id', a.id, 'employee_id', a.employee_id)
    from learning_agreements a
   where a.status <> 'CANCELLED' and a.contract_number is null and a.contract_document_id is null;

  -- индивидуальное обучение с расходами компании, но без соглашения
  insert into _dq_found
  select 'EDU_FUNDED_NO_AGREEMENT', 'WARNING', 'trainings', t.id::text,
         'Индивидуальное обучение «' || t.title || '» оплачено компанией, соглашения о финансировании нет.',
         'Создайте соглашение (политика, договор, условия).',
         jsonb_build_object('training_id', t.id)
    from trainings t join learning_event_types et on et.id = t.event_type_id
   where t.archived_at is null and not et.is_group
     and exists (select 1 from expense_operations o where o.training_id = t.id and o.voided_at is null and o.amount > 0)
     and not exists (select 1 from learning_agreements a where a.training_id = t.id and a.status <> 'CANCELLED');

  -- не сдан экзамен, оплаченный компанией, а политики/договора для расчёта нет
  insert into _dq_found
  select 'FAILED_EXAM_NO_POLICY', 'WARNING', 'exams', x.id::text,
         'Экзамен ' || x.canonical_id || ' (' || e.full_name || ') не сдан; для расчёта обязательства нет подтверждённой политики или договора.',
         'Выберите подтверждённую политику, прикрепите договор и выполните расчёт — или подтвердите решение вручную.',
         jsonb_build_object('exam_id', x.id, 'employee_id', x.employee_id)
    from exams x join exam_costs c on c.exam_id = x.id join employees e on e.id = x.employee_id
   where x.archived_at is null and x.result = 'FAILED' and c.funding_source in ('COMPANY','SHARED') and c.fee > 0
     and not exists (select 1 from learning_agreements a join funding_policies p on p.id = a.policy_id and p.confirmed_at is not null
                      where a.exam_id = x.id and a.status <> 'CANCELLED'
                        and (a.contract_number is not null or a.contract_document_id is not null));

  insert into _dq_found
  select 'AGREEMENT_NOT_EVALUATED', 'INFO', 'learning_agreements', a.id::text,
         'Соглашение ' || a.canonical_id || ': результат уже есть, расчёт не выполнен.',
         'Выполните расчёт обязательства по политике.',
         jsonb_build_object('agreement_id', a.id)
    from learning_agreements a
   where a.status = 'ACTIVE' and a.evaluated_at is null and a.policy_id is not null
     and ((a.exam_id is not null and exists (select 1 from exams x where x.id = a.exam_id and x.result <> 'PENDING'))
       or (a.training_id is not null and exists (select 1 from training_participants p where p.training_id = a.training_id
                                                    and p.employee_id = a.employee_id and p.result is not null)));

  insert into _dq_found
  select 'OBLIGATION_NOT_REVIEWED', 'WARNING', 'learning_agreements', a.id::text,
         'Обязательство по соглашению ' || a.canonical_id || ' (' || a.repayment_amount || ' ' || a.currency || ') ждёт проверки.',
         'Требуется проверка ответственным сотрудником.',
         jsonb_build_object('agreement_id', a.id, 'amount', a.repayment_amount)
    from learning_agreements a where a.status = 'OBLIGATION_CREATED' and a.reviewed_at is null;

  insert into _dq_found
  select 'CONTRACT_EXPIRING', 'INFO', 'documents', d.id::text,
         'Срок документа «' || d.title || '» истекает ' || d.expires_on || '.',
         'Продлите договор или обновите срок.',
         jsonb_build_object('document_id', d.id, 'expires_on', d.expires_on)
    from documents d
   where d.archived_at is null and d.expires_on is not null and d.expires_on <= current_date + 30
     and d.doc_type in ('CONTRACT','AGREEMENT');

  -- валюта без курса (сумма в сомони не рассчитана)
  insert into _dq_found
  select 'EXPENSE_NO_FX', 'ERROR', 'expense_operations', o.id::text,
         'Расход ' || o.amount || ' ' || o.currency || ' от ' || o.operation_date || ' без курса: сумма в сомони не рассчитана.',
         'Внесите курс на дату операции в справочник курсов; USD=1 не подставляется.',
         jsonb_build_object('expense_id', o.id, 'training_id', o.training_id)
    from expense_operations o where o.voided_at is null and o.currency <> 'TJS' and (o.fx_rate is null or o.amount_tjs is null);

  -- запись/обновление
  with up as (
    insert into dq_issues(rule_code, severity, entity_table, entity_id, message, suggestion, details, fingerprint, source)
    select f.rule_code, f.severity, f.entity_table, f.entity_id, f.message, f.suggestion, f.details,
           f.rule_code || '|' || f.entity_table || '|' || f.entity_id, 'RULE'
      from _dq_found f
    on conflict (fingerprint) where fingerprint is not null do update
       set message = excluded.message, suggestion = excluded.suggestion, details = excluded.details,
           severity = excluded.severity, updated_at = now(),
           status = case when dq_issues.status = 'FIXED' then 'OPEN' else dq_issues.status end,
           resolved_by = case when dq_issues.status = 'FIXED' then null else dq_issues.resolved_by end,
           resolved_at = case when dq_issues.status = 'FIXED' then null else dq_issues.resolved_at end,
           resolution  = case when dq_issues.status = 'FIXED' then null else dq_issues.resolution end
    where dq_issues.status in ('OPEN','IN_REVIEW','FIXED')
      and (dq_issues.status = 'FIXED'
           or (dq_issues.message, dq_issues.suggestion, dq_issues.details, dq_issues.severity)
              is distinct from (excluded.message, excluded.suggestion, excluded.details, excluded.severity))
    returning (xmax = 0) as inserted
  ) select count(*) filter (where inserted)::int into n_new from up;

  with fx as (
    update dq_issues d set status = 'FIXED', resolved_at = now(), resolved_by = auth.uid(),
           resolution = 'Исправлено: условие больше не выполняется', updated_at = now()
     where d.source = 'RULE' and d.status in ('OPEN','IN_REVIEW')
       and not exists (select 1 from _dq_found f where d.fingerprint = f.rule_code || '|' || f.entity_table || '|' || f.entity_id)
     returning 1
  ) select count(*)::int into n_fixed from fx;

  drop table _dq_found;
  return query select coalesce(n_new, 0), coalesce(n_fixed, 0),
                      (select count(*)::int from dq_issues where status in ('OPEN','IN_REVIEW'));
end $$;


revoke execute on function dq_scan() from public, anon;
grant execute on function dq_scan() to authenticated;
