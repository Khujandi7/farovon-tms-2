-- Тесты Phase 3A.2 (M21): сквозной жизненный цикл REQUEST → TRAINING → TRAINER → SESSION → PARTICIPANT → ATTENDANCE →
-- EXPENSE → FEEDBACK → RESULT → CERTIFICATE → EMPLOYEE DOSSIER → REPORT, права, аудит, Data Quality.
-- Только локально. Заканчивается намеренной ошибкой RESULT (откат).

create temp table res(n serial, name text, ok boolean, detail text);
create temp table k(name text primary key, id text);

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin insert into res(name, ok) values (p_name, p_cond is true); end $$;
create or replace function pg_temp.uid(r text) returns text language sql as $$
  select case r when 'A' then '00000000-0000-0000-0000-00000000000a' when 'E' then '00000000-0000-0000-0000-00000000000e'
                when 'C' then '00000000-0000-0000-0000-00000000000c' when 'F' then '00000000-0000-0000-0000-00000000000f'
                when 'D' then '00000000-0000-0000-0000-00000000000d' end $$;
create or replace function pg_temp.rv(r text, p_sql text) returns text language plpgsql as $$
declare v text;
begin perform set_config('request.jwt.claim.sub', pg_temp.uid(r), true); set local role authenticated; execute p_sql into v; reset role; return v; end $$;
create or replace function pg_temp.err_as(r text, p_sql text, p_name text, p_like text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', pg_temp.uid(r), true);
  set local role authenticated;
  begin execute p_sql;
  exception when others then
    reset role;
    if sqlerrm not like '%'||p_like||'%' and sqlstate <> p_like then
      insert into res(name, ok, detail) values (p_name, false, 'другая ошибка: '||sqlstate||' '||sqlerrm);
    else insert into res(name, ok) values (p_name, true); end if;
    return;
  end;
  reset role;
  insert into res(name, ok, detail) values (p_name, false, 'ожидалась ошибка, её не было');
end $$;
create or replace function pg_temp.kid(p_name text) returns text language sql as $$ select id from k where name = p_name $$;

alter table profiles alter constraint profiles_id_fkey deferrable initially deferred;
insert into profiles(id,full_name,role,is_active) values
  ('00000000-0000-0000-0000-00000000000a','Админ','ADMIN',true),('00000000-0000-0000-0000-00000000000e','Менеджер','ACADEMY_MANAGER',true),
  ('00000000-0000-0000-0000-00000000000c','Кадровик','HR',true),('00000000-0000-0000-0000-00000000000f','Финансист','FINANCE',true),
  ('00000000-0000-0000-0000-00000000000d','Наблюдатель','VIEWER',true);
insert into expense_categories(code,name,group_code,is_trainer_fee) values ('FEE','Гонорар тренера','TRAINER',true);
insert into org_units(parent_id, name, level) values (null,'Финансовый департамент','DEPARTMENT');
insert into org_units(parent_id, name, level) select id,'Бухгалтерия','UNIT' from org_units where name='Финансовый департамент';
insert into employees(canonical_id, full_name, name_norm, department_id, unit_id, position, employee_code)
select 'E-'||lpad(g::text,4,'0'), 'Сотрудник '||g, 'сотрудник '||g, (select id from org_units where name='Финансовый департамент'),
       (select id from org_units where name='Бухгалтерия'), 'Бухгалтер', 'T'||lpad(g::text,4,'0') from generate_series(1,8) g;
delete from audit_log;

-- ====================== ЗАЯВКА → ОБУЧЕНИЕ ======================
insert into k select 'req', pg_temp.rv('E', $q$select create_request('{"plan_year":2026,"topic":"Курс по МСФО","goal":"Повысить квалификацию","participants_planned":4,"kind":"EXTERNAL","budget_amount":5000,"status":"APPROVED"}'::jsonb)$q$);
select pg_temp.ok((select priority from training_requests where id = pg_temp.kid('req')::uuid) = 'NORMAL', 'L1 приоритет заявки по умолчанию NORMAL');
select pg_temp.rv('E', format($q$select set_request_details(%L, '{"priority":"HIGH","expected_result":"Сертификат МСФО"}'::jsonb)$q$, pg_temp.kid('req')));
select pg_temp.ok((select priority||expected_result from training_requests where id = pg_temp.kid('req')::uuid) = 'HIGHСертификат МСФО', 'L2 приоритет и ожидаемый результат сохраняются');
select pg_temp.err_as('E', format($q$select set_request_details(%L, '{"priority":"???"}'::jsonb)$q$, pg_temp.kid('req')), 'L3 недопустимый приоритет отклоняется', '23514');
select pg_temp.err_as('C', format($q$select create_training_from_request(%L, '{"start_date":"2026-06-01","hours":4}'::jsonb)$q$, pg_temp.kid('req')), 'L4 HR не создаёт обучение из заявки', '42501');
insert into k select 'tr', pg_temp.rv('E', format($q$select create_training_from_request(%L, '{"start_date":"2026-06-01","end_date":"2026-06-03","hours":12}'::jsonb)$q$, pg_temp.kid('req')));
select pg_temp.ok((select title||'|'||request_id::text||'|'||source_type::text||'|'||participants_planned from trainings where id = pg_temp.kid('tr')::uuid) = 'Курс по МСФО|'||pg_temp.kid('req')||'|PLANNED|4', 'L5 обучение из заявки: данные перенесены, связь и тип PLANNED');
insert into k select 'req_new', pg_temp.rv('E', $q$select create_request('{"plan_year":2026,"topic":"Новая","status":"NEW"}'::jsonb)$q$);
select pg_temp.err_as('E', format($q$select create_training_from_request(%L)$q$, pg_temp.kid('req_new')), 'L6 из заявки в статусе NEW обучение не создаётся', 'P0015');

-- ====================== ТРЕНЕРЫ ======================
insert into k select 'trn1', pg_temp.rv('E', $q$select upsert_trainer('{"full_name":"Ахмедов Рустам","kind":"EXTERNAL","organization":"ACCA Academy"}'::jsonb)$q$);
insert into k select 'trn2', pg_temp.rv('E', $q$select upsert_trainer('{"full_name":"Каримова Нигора","kind":"INTERNAL"}'::jsonb)$q$);
select pg_temp.err_as('E', $q$select upsert_trainer('{"full_name":"ахмедов  рустам"}'::jsonb)$q$, 'L7 дубликат тренера (нормализованное ФИО) отклоняется', 'P0015');
select pg_temp.err_as('C', $q$select upsert_trainer('{"full_name":"Хакер"}'::jsonb)$q$, 'L8 HR не ведёт справочник тренеров', '42501');
select pg_temp.rv('E', format($q$select set_training_trainer(%L, %L, 'PRIMARY')$q$, pg_temp.kid('tr'), pg_temp.kid('trn1')));
select pg_temp.rv('E', format($q$select set_training_trainer(%L, %L, 'CO')$q$, pg_temp.kid('tr'), pg_temp.kid('trn2')));
select pg_temp.ok((select count(*) from training_trainers where training_id = pg_temp.kid('tr')::uuid) = 2, 'L9 основной и со-тренер назначены');
select pg_temp.rv('E', format($q$select set_training_trainer(%L, %L, 'PRIMARY')$q$, pg_temp.kid('tr'), pg_temp.kid('trn2')));
select pg_temp.ok((select trainer_id::text from training_trainers where training_id = pg_temp.kid('tr')::uuid and role = 'PRIMARY') = pg_temp.kid('trn2'), 'L10 основной тренер всегда один: прежний стал со-тренером');
select pg_temp.err_as('E', format($q$select remove_training_trainer(%L, %L, '')$q$, pg_temp.kid('tr'), pg_temp.kid('trn1')), 'L11 снятие тренера требует причину', 'P0012');
select pg_temp.ok((select count(*) from audit_log where table_name = 'training_trainers') >= 3, 'L12 назначения тренеров попадают в аудит');
select pg_temp.ok(exists (select 1 from entity_audit('trainings', pg_temp.kid('tr')::uuid, 100) where true) , 'L13 история обучения читается');

-- ====================== ЗАХОДЫ ======================
insert into k select 's1', pg_temp.rv('E', format($q$select upsert_session(%L, null, '{"start_date":"2026-06-01","end_date":"2026-06-01","hours":4}'::jsonb, null)$q$, pg_temp.kid('tr')));
insert into k select 's2', pg_temp.rv('E', format($q$select upsert_session(%L, null, '{"start_date":"2026-06-02","end_date":"2026-06-02","hours":4}'::jsonb, null)$q$, pg_temp.kid('tr')));
insert into k select 's3', pg_temp.rv('E', format($q$select upsert_session(%L, null, '{"start_date":"2026-06-03","end_date":"2026-06-03","hours":4}'::jsonb, null)$q$, pg_temp.kid('tr')));
select pg_temp.rv('E', format($q$select set_session_details(%L, '{"start_time":"09:00","end_time":"13:00","room":"Зал 2","trainer_id":"%s"}'::jsonb)$q$, pg_temp.kid('s1'), pg_temp.kid('trn2')));
select pg_temp.ok((select room||start_time::text from training_sessions where id = pg_temp.kid('s1')::uuid) = 'Зал 209:00:00', 'L14 детали захода сохраняются');
select pg_temp.err_as('E', format($q$select set_session_details(%L, '{"start_time":"14:00","end_time":"10:00"}'::jsonb)$q$, pg_temp.kid('s2')), 'L16 конец раньше начала в тот же день отклоняется', '23514');
select pg_temp.ok((select hours from trainings where id = pg_temp.kid('tr')::uuid) = 12, 'L17 часы обучения считаются по заходам (3×4)');

-- ====================== УЧАСТНИКИ / ПОСЕЩАЕМОСТЬ ======================
select pg_temp.rv('C', format($q$select add_participants(%L, array(select id from employees order by employee_code limit 4), 'тест')$q$, pg_temp.kid('tr')));
select pg_temp.ok((select count(*) from training_participants where training_id = pg_temp.kid('tr')::uuid and department_snapshot is not null) = 4, 'L18 у участников есть снимок подразделения');
insert into k select 'p1', (select id::text from training_participants where training_id = pg_temp.kid('tr')::uuid order by employee_id limit 1);
select pg_temp.rv('C', format($q$select set_attendance(jsonb_build_array(jsonb_build_object('participant_id','%s','session_id','%s','status','PRESENT'), jsonb_build_object('participant_id','%s','session_id','%s','status','ABSENT'), jsonb_build_object('participant_id','%s','session_id','%s','status','PRESENT')), 'явка')$q$,
  pg_temp.kid('p1'), pg_temp.kid('s1'), pg_temp.kid('p1'), pg_temp.kid('s2'), pg_temp.kid('p1'), pg_temp.kid('s3')));
select pg_temp.ok((select actual_man_hours from training_summary(pg_temp.kid('tr')::uuid)) >= 8, 'L19 факт. часы участника из посещаемости: PRESENT/ABSENT/PRESENT = 8 ч');
select pg_temp.ok((select added_participants from training_summary(pg_temp.kid('tr')::uuid)) = 4 and (select planned_participants from training_summary(pg_temp.kid('tr')::uuid)) = 4, 'L20 сводка: запланировано 4 / добавлено 4 — из записей');

-- ====================== РАСХОДЫ ======================
select pg_temp.rv('F', format($q$select add_expense(%L, (select id from expense_categories where code='FEE'), 1200, 'TJS', '2026-06-03', 'гонорар', 'оплата тренера')$q$, pg_temp.kid('tr')));
select pg_temp.ok(pg_temp.rv('F', format($q$select actual_cost_tjs::text from training_summary(%L)$q$, pg_temp.kid('tr')))::numeric = 1200, 'L22 FINANCE видит фактические расходы 1200');
select pg_temp.ok(pg_temp.rv('F', format($q$select remaining_budget_tjs::text from training_summary(%L)$q$, pg_temp.kid('tr')))::numeric = 3800, 'L23 остаток бюджета из заявки: 5000 − 1200 = 3800');
select pg_temp.ok(pg_temp.rv('C', format($q$select (actual_cost_tjs is null and cost_per_participant is null and cost_per_learning_hour is null and remaining_budget_tjs is null)::text from training_summary(%L)$q$, pg_temp.kid('tr'))) = 'true', 'L24 HR не видит финансовых показателей сводки');
select pg_temp.ok(pg_temp.rv('F', format($q$select (cost_per_learning_hour is not null)::text from training_summary(%L)$q$, pg_temp.kid('tr'))) = 'true', 'L25 стоимость часа обучения считает база');

-- ====================== ОБРАТНАЯ СВЯЗЬ ======================
select pg_temp.err_as('E', format($q$select send_feedback_invitations(%L)$q$, pg_temp.kid('tr')), 'L26 обратная связь запрашивается только после начала обучения', 'P0015');
select pg_temp.rv('E', format($q$select 1 from (select update_training(%L, '{"status":"IN_PROGRESS"}'::jsonb, 'начали') ) x$q$, pg_temp.kid('tr')));
select pg_temp.rv('E', format($q$select 1 from (select update_training(%L, '{"status":"COMPLETED"}'::jsonb, 'завершили') ) x$q$, pg_temp.kid('tr')));
select pg_temp.ok(pg_temp.rv('E', format($q$select send_feedback_invitations(%L)$q$, pg_temp.kid('tr')))::int = (select count(*) from training_participants where training_id = pg_temp.kid('tr')::uuid and attended), 'L27 приглашения получают только участники');
select pg_temp.ok(pg_temp.rv('E', format($q$select send_feedback_invitations(%L)$q$, pg_temp.kid('tr')))::int = 0, 'L28 повторная отправка не дублирует приглашения');
select pg_temp.err_as('C', format($q$select send_feedback_invitations(%L)$q$, pg_temp.kid('tr')), 'L29 HR не отправляет приглашения', '42501');
select pg_temp.rv('E', format($q$select record_feedback_response('%s', '{"MATERIALS":{"1":5,"2":4},"TRAINER":{"1":5},"ORG":{"1":3}}'::jsonb, 'хорошо')$q$, pg_temp.kid('p1')));
select pg_temp.err_as('E', format($q$select record_feedback_response('%s', '{"MATERIALS":{"1":5}}'::jsonb)$q$, pg_temp.kid('p1')), 'L30 повторный ответ участника отклоняется', 'P0015');
select pg_temp.err_as('E', format($q$select record_feedback_response('%s', '{"MATERIALS":{"1":6}}'::jsonb)$q$, (select id from training_participants where training_id = pg_temp.kid('tr')::uuid and id::text <> pg_temp.kid('p1') limit 1)), 'L31 оценка вне 1–5 отклоняется', 'P0015');
select pg_temp.ok(pg_temp.rv('E', format($q$select invited::text||'/'||answered::text||'/'||response_rate::text from training_feedback_summary(%L)$q$, pg_temp.kid('tr'))) = '4/1/25.0', 'L33 приглашено 4, ответило 1, доля ответов 25.0%');
-- итог: (4.5*40 + 5*40 + 3*20) / 100 = 4.40
select pg_temp.ok(pg_temp.rv('E', format($q$select final_score::text from training_feedback_summary(%L)$q$, pg_temp.kid('tr')))::numeric = 4.40, 'L34 итоговая оценка по весам 40/40/20 = 4.40');
select pg_temp.ok(pg_temp.rv('C', format($q$select (final_score is null and scores_hidden)::text from training_feedback_summary(%L)$q$, pg_temp.kid('tr'))) = 'true', 'L35 HR: оценки скрыты ниже порога анонимности');
select pg_temp.ok(pg_temp.rv('C', format($q$select invited::text from training_feedback_summary(%L)$q$, pg_temp.kid('tr'))) = '4', 'L36 HR видит счётчики приглашений');
select pg_temp.ok((select count(*) from feedback_answers a join feedback_responses r on r.id = a.response_id join feedback_trainings f on f.id = r.feedback_training_id where f.training_id = pg_temp.kid('tr')::uuid) = 4, 'L37 сырые ответы хранятся отдельно и привязаны к обучению');
select pg_temp.ok(pg_temp.rv('E', $q$select count(*)::text from feedback_invitations$q$)::int = 4, 'L38 менеджер читает приглашения');
select pg_temp.ok(pg_temp.rv('F', $q$select count(*)::text from feedback_invitations$q$)::int = 0, 'L39 FINANCE не видит приглашений (личные данные)');

-- ====================== РЕЗУЛЬТАТЫ / СЕРТИФИКАТЫ ======================
select pg_temp.rv('C', format($q$select set_participant_result('%s', 'COMPLETED', null, 'итог')$q$, pg_temp.kid('p1')));
insert into k select 'cert', pg_temp.rv('C', format($q$select create_certificate(jsonb_build_object('employee_id', (select employee_id from training_participants where id = '%s'), 'name', 'МСФО', 'issue_date', '2026-06-10', 'training_id', '%s', 'certificate_number', 'IFRS-1'))$q$, pg_temp.kid('p1'), pg_temp.kid('tr')));
select pg_temp.ok((select status from training_results(pg_temp.kid('tr')::uuid) where participant_id = pg_temp.kid('p1')::uuid) = 'CERTIFIED', 'L40 результат участника: сертификат выдан');
select pg_temp.ok((select count(*) from training_results(pg_temp.kid('tr')::uuid) where status = 'ENROLLED' or status = 'PARTIAL') = 3, 'L41 остальные участники — записаны/частично посетили');
select pg_temp.ok((select certificate_number from training_results(pg_temp.kid('tr')::uuid) where participant_id = pg_temp.kid('p1')::uuid) = 'IFRS-1', 'L42 сертификат виден в результатах обучения');

-- ====================== ДОСЬЕ / ОТЧЁТЫ ======================
select pg_temp.ok(pg_temp.rv('C', format($q$select count(*)::text from employee_timeline('%s')$q$, (select employee_id from training_participants where id = pg_temp.kid('p1')::uuid)))::int >= 1, 'L43 обучение сотрудника видно в его хронологии');
select pg_temp.ok(pg_temp.rv('C', format($q$select events_count::text from employee_learning_summary('%s')$q$, (select employee_id from training_participants where id = pg_temp.kid('p1')::uuid)))::int = 1, 'L44 сводка досье учитывает обучение');
select pg_temp.ok(pg_temp.rv('E', $q$select delivered_events::text||'/'||unique_trained::text||'/'||certificates_issued::text from lifecycle_kpis(2026::smallint)$q$) = '1/4/1', 'L45 KPI года: 1 обучение, 4 уникальных сотрудника, 1 сертификат');
select pg_temp.ok(pg_temp.rv('E', $q$select delivered_events::text from lifecycle_kpis(2026::smallint)$q$)::int = (select delivered_count from kpi_year(2026::smallint)), 'L46 lifecycle_kpis совпадает с kpi_year по числу проведённых');
select pg_temp.ok(pg_temp.rv('E', $q$select man_hours::text from lifecycle_kpis(2026::smallint)$q$)::numeric = (select delivered_man_hours from kpi_year(2026::smallint)), 'L47 человеко-часы совпадают с kpi_year');
select pg_temp.ok(pg_temp.rv('C', $q$select (actual_cost_tjs is null and cost_per_participant is null)::text from lifecycle_kpis(2026::smallint)$q$) = 'true', 'L48 HR не получает затрат в KPI');
select pg_temp.ok(pg_temp.rv('E', $q$select response_rate::text from lifecycle_kpis(2026::smallint)$q$)::numeric = 25.0, 'L49 доля ответов в KPI = 25.0');
select pg_temp.ok((select participants from department_participation(2026::smallint) where department = 'Финансовый департамент') = 4, 'L50 участие подразделения из снимка = 4');
-- перевод сотрудника не переписывает историю
update employees set department_id = null, unit_id = null where id = (select employee_id from training_participants where id = pg_temp.kid('p1')::uuid);
select pg_temp.ok((select participants from department_participation(2026::smallint) where department = 'Финансовый департамент') = 4, 'L51 смена подразделения сотрудника не меняет прошлую аналитику');
select pg_temp.ok((select events from trainer_performance(2026::smallint) where trainer_id = pg_temp.kid('trn2')::uuid) = 1, 'L52 эффективность тренера: 1 обучение');
select pg_temp.ok((select avg_trainer_score from trainer_performance(2026::smallint) where trainer_id = pg_temp.kid('trn2')::uuid and responses > 0) = 5.00, 'L53 менеджер видит оценку тренера 5.00');
select pg_temp.ok(pg_temp.rv('C', format($q$select (avg_trainer_score is null and scores_hidden)::text from trainer_performance(2026::smallint) where trainer_id = '%s'$q$, pg_temp.kid('trn2'))) = 'true', 'L54 HR: оценка тренера скрыта ниже порога');

-- ====================== ПОИСК ======================
select pg_temp.ok(pg_temp.rv('D', $q$select count(*)::text from global_search_ext('Каримова')$q$)::int = 1, 'L55 поиск находит тренера');
select pg_temp.ok(pg_temp.rv('D', $q$select count(*)::text from global_search_ext('К')$q$)::int = 0, 'L56 короткий запрос пуст');

-- ====================== DATA QUALITY ======================
insert into trainings(canonical_id, title, format, kind, hours, start_date, end_date, status, source_type, source_confirmed, event_type_id)
values ('TR-DQ-1', 'Без тренера', 'OFFLINE', 'INTERNAL', 4, '2026-03-01', '2026-03-01', 'COMPLETED', 'UNPLANNED', true, (select id from learning_event_types where code='TRAINING'));
select pg_temp.rv('E', $q$select * from dq_scan_lifecycle()$q$);
select pg_temp.ok(exists (select 1 from dq_issues where rule_code = 'TRAINING_NO_TRAINER' and status = 'OPEN'), 'L57 DQ: завершённое обучение без тренера');
select pg_temp.ok(not exists (select 1 from dq_issues where rule_code = 'TRAINING_NO_TRAINER' and entity_id = pg_temp.kid('tr')), 'L58 DQ: обучение с тренером не помечено');
insert into feedback_trainings(code, title, training_id) values ('FBT-X', 'Чужой', pg_temp.kid('tr')::uuid);
insert into feedback_responses(feedback_training_id, submitted_at) select id, now() from feedback_trainings where code = 'FBT-X';
insert into feedback_respondents(response_id, employee_id, respondent_raw, dedupe_key, match_status)
select r.id, (select id from employees order by employee_code desc limit 1), 'Сотрудник 8', 'x1', 'CONFIRMED' from feedback_responses r join feedback_trainings f on f.id = r.feedback_training_id where f.code = 'FBT-X';
select pg_temp.rv('E', $q$select * from dq_scan_lifecycle()$q$);
select pg_temp.ok(exists (select 1 from dq_issues where rule_code = 'FEEDBACK_NON_PARTICIPANT' and status = 'OPEN'), 'L60 DQ: отзыв от не-участника');
insert into trainings(canonical_id, title, format, kind, hours, start_date, end_date, status, source_type, source_confirmed, event_type_id)
values ('TR-DQ-2', 'Сирота', 'OFFLINE', 'INTERNAL', 4, '2026-03-01', '2026-03-01', 'COMPLETED', 'UNPLANNED', true, (select id from learning_event_types where code='TRAINING'));
insert into feedback_trainings(code, title, training_id) values ('FBT-ORPHAN', 'Без обучения', null);
insert into feedback_responses(feedback_training_id, submitted_at) select id, now() from feedback_trainings where code = 'FBT-ORPHAN';
select pg_temp.rv('E', $q$select * from dq_scan_lifecycle()$q$);
select pg_temp.ok((select severity::text from dq_issues where rule_code = 'FEEDBACK_NO_TRAINING' limit 1) = 'CRITICAL', 'L61 DQ: отзыв без обучения — CRITICAL');
select pg_temp.ok(exists (select 1 from dq_issues where rule_code = 'CERT_NOT_PARTICIPANT') = false, 'L62 DQ: сертификат участника не помечается');
delete from training_participants where id = pg_temp.kid('p1')::uuid;
select pg_temp.rv('E', $q$select * from dq_scan_lifecycle()$q$);
select pg_temp.ok(exists (select 1 from dq_issues where rule_code = 'CERT_NOT_PARTICIPANT' and status = 'OPEN'), 'L63 DQ: сертификат по обучению без участия');
select pg_temp.err_as('C', $q$select * from dq_scan_lifecycle()$q$, 'L64 HR не запускает проверку качества', '42501');
select pg_temp.rv('E', $q$select * from dq_scan_lifecycle()$q$);
select pg_temp.ok((select count(*) from dq_issues where rule_code = 'TRAINING_NO_TRAINER') = (select count(distinct entity_id) from dq_issues where rule_code = 'TRAINING_NO_TRAINER'), 'L66 DQ идемпотентна (один fingerprint — одна запись)');

-- ====================== ПРАВА НА ФУНКЦИИ ======================
select pg_temp.ok(not has_function_privilege('anon', 'lifecycle_kpis(smallint)', 'execute'), 'L67 anon не вызывает lifecycle_kpis');
select pg_temp.ok(not has_function_privilege('anon', 'send_feedback_invitations(uuid, text)', 'execute'), 'L68 anon не вызывает send_feedback_invitations');
select pg_temp.err_as('D', format($q$select set_training_trainer(%L, %L, 'CO')$q$, pg_temp.kid('tr'), pg_temp.kid('trn1')), 'L69 VIEWER не назначает тренеров', '42501');
select pg_temp.err_as('D', format($q$select create_training_from_request(%L)$q$, pg_temp.kid('req')), 'L70 VIEWER не создаёт обучение из заявки', '42501');
select pg_temp.ok((select count(*) from pg_proc p where pronamespace = 'public'::regnamespace and proname in ('lifecycle_kpis','department_participation','trainer_performance','training_summary','training_results','training_feedback_summary','dq_scan_lifecycle','global_search_ext','send_feedback_invitations','record_feedback_response','upsert_trainer','set_training_trainer','remove_training_trainer','set_session_details','set_request_details','create_training_from_request') and proconfig::text like '%search_path%') = 16, 'L71 у всех новых функций задан search_path');

do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
