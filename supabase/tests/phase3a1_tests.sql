-- Тесты Phase 3A.1 (M14–M20): Learning Events, сотрудники и подразделения, экзамены, сертификаты, навыки, цели, финансирование,
-- документы и Storage, публичные заявки, импорты, уведомления, поиск, Data Quality, аудит, права.
-- Только локально. Заканчивается намеренной ошибкой RESULT (откат).

create temp table res(n serial, name text, ok boolean, detail text);
create temp table k(name text primary key, id text);   -- запомненные идентификаторы (читаются только от имени postgres)

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin insert into res(name, ok) values (p_name, p_cond is true); end $$;
create or replace function pg_temp.expect_error(p_sql text, p_name text, p_like text default null) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if p_like is not null and sqlerrm not like '%'||p_like||'%' and sqlstate <> p_like then
      insert into res(name, ok, detail) values (p_name, false, 'другая ошибка: '||sqlstate||' '||sqlerrm);
    else insert into res(name, ok) values (p_name, true); end if;
    return;
  end;
  insert into res(name, ok, detail) values (p_name, false, 'ожидалась ошибка, её не было');
end $$;
create or replace function pg_temp.uid(r text) returns text language sql as $$
  select case r when 'A' then '00000000-0000-0000-0000-00000000000a' when 'E' then '00000000-0000-0000-0000-00000000000e'
                when 'C' then '00000000-0000-0000-0000-00000000000c' when 'F' then '00000000-0000-0000-0000-00000000000f'
                when 'D' then '00000000-0000-0000-0000-00000000000d' end $$;
-- выполнить от имени роли (A=ADMIN, E=MANAGER, C=HR, F=FINANCE, D=VIEWER)
create or replace function pg_temp.ra(r text, p_sql text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', pg_temp.uid(r), true); set local role authenticated; execute p_sql; reset role; end $$;
create or replace function pg_temp.rv(r text, p_sql text) returns text language plpgsql as $$
declare v text;
begin perform set_config('request.jwt.claim.sub', pg_temp.uid(r), true); set local role authenticated; execute p_sql into v; reset role; return v; end $$;
create or replace function pg_temp.svc(p_sql text) returns text language plpgsql as $$
declare v text;
begin set local role service_role; execute p_sql into v; reset role; return v; end $$;
create or replace function pg_temp.anon_(p_sql text) returns text language plpgsql as $$
declare v text;
begin set local role anon; execute p_sql into v; reset role; return v; end $$;
-- ошибка от имени роли
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

create or replace function pg_temp.noop_as(r text, p_sql text, p_check text, p_name text) returns void language plpgsql as $$
declare v boolean;
begin
  perform set_config('request.jwt.claim.sub', pg_temp.uid(r), true);
  set local role authenticated;
  begin execute p_sql; exception when others then null; end;
  reset role;
  execute p_check into v;
  insert into res(name, ok, detail) values (p_name, v is true, case when v is true then null else 'данные изменились' end);
end $$;
-- ---------- Данные ----------
alter table profiles alter constraint profiles_id_fkey deferrable initially deferred;
insert into profiles(id,full_name,role,is_active) values
  ('00000000-0000-0000-0000-00000000000a','Админ','ADMIN',true),('00000000-0000-0000-0000-00000000000e','Менеджер','ACADEMY_MANAGER',true),
  ('00000000-0000-0000-0000-00000000000c','Кадровик','HR',true),('00000000-0000-0000-0000-00000000000f','Финансист','FINANCE',true),
  ('00000000-0000-0000-0000-00000000000d','Наблюдатель','VIEWER',true);
insert into expense_categories(code,name,group_code,is_trainer_fee) values ('FEE','Гонорар тренера','TRAINER',true),('COURSE','Оплата курса','ORG',false);
insert into org_units(name, level) values ('Финансовый департамент','DEPARTMENT'),('Юридический департамент','DEPARTMENT');
insert into org_units(parent_id, name, level) select id,'Отдел внутреннего контроля','UNIT' from org_units where name='Финансовый департамент';
insert into org_units(parent_id, name, level) select id,'Бухгалтерия','UNIT' from org_units where name='Финансовый департамент';
insert into fx_rates values ('2026-01-01','USD',10.90,'тест');
insert into employees(canonical_id, full_name, name_norm, department_id, unit_id, position, employee_code)
select 'E-'||lpad(g::text,4,'0'), 'Сотрудник '||g, 'сотрудник '||g, (select id from org_units where name='Финансовый департамент'),
       (select id from org_units where name='Бухгалтерия'), 'Бухгалтер', 'T'||lpad(g::text,4,'0') from generate_series(1,40) g;
insert into employees(canonical_id, full_name, name_norm, position, employee_code) values
  ('E-1001','Азамов Фаррух','азамов фаррух','Юрист','X1001'),('E-1002','Иванов Иван','иванов иван','Аналитик','X1002'),('E-1003','Иванов Иван','иванов иван','Аудитор','X1003');
delete from audit_log;

-- ====================== LEARNING EVENTS ======================
select pg_temp.ok((select count(*) from learning_event_types where is_system) = 12, 'L1 системные типы мероприятий засеяны (12)');
select pg_temp.ok((select code from learning_event_types where id = (select event_type_id from trainings limit 1)) is null, 'L2 пустая БД: прежних тренингов нет'); 
insert into k select 'seminar', pg_temp.rv('E', $q$select create_training('{"title":"Семинар по налогам","start_date":"2026-03-10","hours":4,"event_type_code":"SEMINAR","organizer":"НК"}'::jsonb)$q$);
insert into k select 'forum', pg_temp.rv('E', $q$select create_training('{"title":"Финансовый форум","start_date":"2026-04-10","end_date":"2026-04-11","hours":12,"event_type_code":"FORUM","organizer":"Ассоциация","location":"Душанбе"}'::jsonb)$q$);
insert into k select 'conf', pg_temp.rv('E', $q$select create_training('{"title":"Конференция CFO","start_date":"2026-05-10","hours":8,"event_type_code":"CONFERENCE"}'::jsonb)$q$);
insert into k select 'plain', pg_temp.rv('E', $q$select create_training('{"title":"Обычный тренинг","start_date":"2026-06-10","hours":8}'::jsonb)$q$);
insert into k select 'indiv', pg_temp.rv('E', $q$select create_training('{"title":"CAP: подготовка","start_date":"2026-02-10","end_date":"2026-04-10","hours":60,"event_type_code":"INDIVIDUAL_EDUCATION"}'::jsonb)$q$);
select pg_temp.ok((select event_type_code from v_training_list where id = (select id::uuid from k where name='seminar')) = 'SEMINAR', 'L3 семинар создан с типом SEMINAR');
select pg_temp.ok((select event_type_code from v_training_list where id = (select id::uuid from k where name='forum')) = 'FORUM'
              and (select organizer from v_training_list where id = (select id::uuid from k where name='forum')) = 'Ассоциация', 'L3 форум: тип и организатор');
select pg_temp.ok((select event_type_code from v_training_list where id = (select id::uuid from k where name='conf')) = 'CONFERENCE', 'L3 конференция');
select pg_temp.ok((select event_type_code from v_training_list where id = (select id::uuid from k where name='plain')) = 'TRAINING', 'L4 без типа — «Обучение»');
select pg_temp.err_as('C', $q$select create_training('{"title":"X","start_date":"2026-05-01","hours":8,"event_type_code":"FORUM"}'::jsonb)$q$, 'L5 HR не создаёт мероприятие', '42501');
select pg_temp.err_as('E', $q$select create_training('{"title":"X","start_date":"2026-05-01","hours":8,"event_type_code":"NOPE"}'::jsonb)$q$, 'L6 неизвестный тип отклонён', 'P0015');
-- справочник типов: только ADMIN
select pg_temp.err_as('E', $q$select upsert_event_type(null, '{"code":"HACKATHON","name":"Хакатон"}'::jsonb)$q$, 'L7 MANAGER не добавляет тип', '42501');
select pg_temp.ra('A', $q$select upsert_event_type(null, '{"code":"HACKATHON","name":"Хакатон","is_group":true}'::jsonb)$q$);
select pg_temp.ok(exists (select 1 from learning_event_types where code='HACKATHON' and not is_system), 'L7 ADMIN добавил тип без изменения кода');
select pg_temp.ra('E', $q$select create_training('{"title":"Хакатон 2026","start_date":"2026-07-01","hours":16,"event_type_code":"HACKATHON"}'::jsonb)$q$);
select pg_temp.ok((select count(*) from trainings where title='Хакатон 2026') = 1, 'L7 мероприятие нового типа создаётся');
select pg_temp.err_as('A', $q$select upsert_event_type(null, '{"code":"bad code","name":"X"}'::jsonb)$q$, 'L8 некорректный код типа', 'P0015');
select pg_temp.ra('A', format($q$select upsert_event_type(%s::smallint, '{"name":"Обучение","is_group":false}'::jsonb)$q$, (select id from learning_event_types where code='TRAINING')));
select pg_temp.ok((select is_group from learning_event_types where code='TRAINING'), 'L8 у системного типа флаг группового мероприятия не меняется');
-- lifecycle
select pg_temp.ra('E', format($q$select update_training(%L, '{"status":"APPROVED"}'::jsonb, 'Согласовано')$q$, (select id from k where name='seminar')));
select pg_temp.ok((select status::text from trainings where id=(select id::uuid from k where name='seminar')) = 'APPROVED', 'L9 PLANNED → APPROVED');
select pg_temp.ra('E', format($q$select update_training(%L, '{"status":"REGISTERED"}'::jsonb, 'Регистрация')$q$, (select id from k where name='seminar')));
select pg_temp.ra('E', format($q$select update_training(%L, '{"status":"COMPLETED"}'::jsonb, 'Проведён')$q$, (select id from k where name='seminar')));
select pg_temp.err_as('E', format($q$select update_training(%L, '{"status":"PLANNED"}'::jsonb, 'Назад')$q$, (select id from k where name='seminar')), 'L10 COMPLETED → PLANNED запрещён менеджеру (сервер)', 'не разрешён');
select pg_temp.err_as('E', format($q$update trainings set status='DRAFT' where id=%L$q$, (select id from k where name='seminar')), 'L10 прямой UPDATE статуса тоже проверяется триггером', 'не разрешён');
select pg_temp.ra('A', format($q$select update_training(%L, '{"status":"PLANNED"}'::jsonb, 'Исправление ошибки')$q$, (select id from k where name='seminar')));
select pg_temp.ok((select status::text from trainings where id=(select id::uuid from k where name='seminar')) = 'PLANNED', 'L11 ADMIN исправляет любой переход с причиной');
select pg_temp.err_as('E', format($q$select update_training(%L, '{"status":"CANCELLED"}'::jsonb, '')$q$, (select id from k where name='plain')), 'L12 смена статуса без причины запрещена', 'P0012');
-- KPI: индивидуальное обучение не считается «проведёнными обучениями»
select pg_temp.ra('A', format($q$select update_training(%L, '{"status":"COMPLETED"}'::jsonb, 'Закончено')$q$, (select id from k where name='indiv')));
select pg_temp.ra('A', format($q$select update_training(%L, '{"status":"COMPLETED"}'::jsonb, 'Проведён')$q$, (select id from k where name='forum')));
select pg_temp.ok((select delivered_count from kpi_year(2026::smallint)) = 1, 'L13 KPI: индивидуальное обучение не входит в delivered_count (только форум)');
-- провайдеры
select pg_temp.ra('E', $q$select upsert_provider(null, '{"name":"ACCA Learning","kind":"EXTERNAL"}'::jsonb)$q$);
select pg_temp.err_as('E', $q$select upsert_provider(null, '{"name":"acca learning"}'::jsonb)$q$, 'L14 дубль провайдера по названию', '23505');
select pg_temp.err_as('C', $q$select upsert_provider(null, '{"name":"Другой"}'::jsonb)$q$, 'L14 HR не ведёт провайдеров', '42501');

-- ====================== СОТРУДНИКИ, ПОДРАЗДЕЛЕНИЯ, СОПОСТАВЛЕНИЕ ======================
insert into k select 'emp_new', pg_temp.rv('C', $q$select create_employee('{"full_name":"Рахимов Али","employee_code":"N-777","hire_date":"2024-02-01","email":"ali@x.tj","phone":"+992900000000","position":"Экономист"}'::jsonb)$q$);
select pg_temp.ok((select employee_code from employees where id=(select id::uuid from k where name='emp_new')) = 'N-777', 'E1 табельный номер сохранён');
select pg_temp.err_as('C', $q$select create_employee('{"full_name":"Другой","employee_code":"n-777"}'::jsonb)$q$, 'E2 табельный номер уникален (без учёта регистра)', '23505');
select pg_temp.ok((select email from employee_contacts where employee_id=(select id::uuid from k where name='emp_new')) = 'ali@x.tj', 'E3 email в контактах');
select pg_temp.ok(pg_temp.rv('F', $q$select count(*) from employee_contacts$q$)::int = 0, 'E3 FINANCE не видит контакты');
select pg_temp.ok(pg_temp.rv('D', $q$select count(*) from employee_contacts$q$)::int = 0, 'E3 VIEWER не видит контакты');
select pg_temp.err_as('D', $q$select create_employee('{"full_name":"Хакер"}'::jsonb)$q$, 'E4 VIEWER не создаёт сотрудника', '42501');
select pg_temp.err_as('C', format($q$select update_employee(%L, '{"termination_date":"2026-01-10"}'::jsonb, '')$q$, (select id from k where name='emp_new')), 'E5 увольнение требует причину', 'P0012');
select pg_temp.ra('C', format($q$select update_employee(%L, '{"termination_date":"2026-01-10"}'::jsonb, 'Приказ №5')$q$, (select id from k where name='emp_new')));
select pg_temp.ok(not (select is_active from employees where id=(select id::uuid from k where name='emp_new')), 'E5 дата увольнения в прошлом → сотрудник неактивен');
select pg_temp.ra('C', format($q$select update_employee(%L, '{"termination_date":null,"is_active":true}'::jsonb, 'Ошибка в приказе')$q$, (select id from k where name='emp_new')));
select pg_temp.ok((select is_active from employees where id=(select id::uuid from k where name='emp_new')), 'E5 восстановление с причиной');
-- сопоставление
select pg_temp.ok((select (r->>'status') from jsonb_array_elements(pg_temp.rv('C', $q$select match_names(array['Азамов Фаррух'])$q$)::jsonb) r) = 'FOUND', 'M1 точное ФИО → FOUND');
select pg_temp.ok((select (r->>'status') from jsonb_array_elements(pg_temp.rv('C', $q$select match_names(array['Фаррух Азамов'])$q$)::jsonb) r) = 'FOUND'
              and (select r->'candidates'->0->>'match_kind' from jsonb_array_elements(pg_temp.rv('C', $q$select match_names(array['Фаррух Азамов'])$q$)::jsonb) r) = 'REORDERED', 'M2 другой порядок слов находится (REORDERED)');
select pg_temp.ok((select (r->>'status') from jsonb_array_elements(pg_temp.rv('C', $q$select match_names(array['Иванов Иван'])$q$)::jsonb) r) = 'AMBIGUOUS', 'M3 два Ивановых → AMBIGUOUS, автосопоставления нет');
select pg_temp.ok((select (r->>'status') from jsonb_array_elements(pg_temp.rv('C', $q$select match_names(array['Неизвестный Человек'])$q$)::jsonb) r) = 'NOT_FOUND', 'M4 нет совпадения → NOT_FOUND');
select pg_temp.ok((select (r->>'status') from jsonb_array_elements(pg_temp.rv('C', $q$select match_names(array['Кто-то'], array['X1001'])$q$)::jsonb) r) = 'FOUND', 'M5 по табельному номеру');
select pg_temp.ok((select count(*) from employees) = 44, 'M6 сопоставление ничего не создаёт: сотрудников по-прежнему 44');
select pg_temp.err_as('D', $q$select match_names(array['x'])$q$, 'M7 VIEWER не вызывает сопоставление', '42501');
-- подразделения
select pg_temp.ra('C', $q$select create_org_unit('{"name":"Казначейство","parent_id":null}'::jsonb)$q$);
select pg_temp.ok(exists (select 1 from org_units where name='Казначейство' and level='DEPARTMENT'), 'O1 департамент создан через UI-RPC');
select pg_temp.err_as('D', $q$select create_org_unit('{"name":"Левое"}'::jsonb)$q$, 'O1 VIEWER не создаёт подразделение', '42501');
select pg_temp.err_as('C', format($q$select rename_org_unit(%s, 'Бухгалтерия и отчётность', '')$q$, (select id from org_units where name='Бухгалтерия')), 'O2 переименование требует причину', 'P0012');
select pg_temp.ra('C', format($q$select rename_org_unit(%s, 'Бухгалтерия и отчётность', 'Реорганизация')$q$, (select id from org_units where name='Бухгалтерия')));
select pg_temp.ok((select unit_id from employees where canonical_id='E-0001') = (select id from org_units where name='Бухгалтерия и отчётность'), 'O2 переименование: сотрудники остаются привязаны по id');
select pg_temp.ok(exists (select 1 from org_unit_aliases where org_unit_id=(select id from org_units where name='Бухгалтерия и отчётность') and alias_norm='бухгалтерия'), 'O2 прежнее название сохранено как псевдоним');
select pg_temp.ra('C', format($q$select move_org_unit(%s, %s, 'Перевод отдела')$q$, (select id from org_units where name='Бухгалтерия и отчётность'), (select id from org_units where name='Юридический департамент')));
select pg_temp.ok((select department_id from employees where canonical_id='E-0001') = (select id from org_units where name='Юридический департамент'), 'O3 перемещение отдела обновило департамент сотрудников');
select pg_temp.err_as('C', format($q$select move_org_unit(%s, %s, 'x')$q$, (select id from org_units where name='Юридический департамент'), (select id from org_units where name='Казначейство')), 'O3 департамент переместить нельзя', 'P0015');
select pg_temp.err_as('C', format($q$select set_org_unit_active(%s, false, 'закрыт')$q$, (select id from org_units where name='Юридический департамент')), 'O4 нельзя деактивировать департамент с действующим отделом', 'P0015');
select pg_temp.ra('C', format($q$select set_org_unit_active(%s, false, 'Расформирован')$q$, (select id from org_units where name='Отдел внутреннего контроля')));
select pg_temp.ok(not (select is_active from org_units where name='Отдел внутреннего контроля'), 'O5 отдел деактивирован, история (ссылки по id) сохранена');
select pg_temp.ra('C', format($q$select set_org_unit_active(%s, true, 'Восстановлен')$q$, (select id from org_units where name='Отдел внутреннего контроля')));
select pg_temp.ok((select is_active from org_units where name='Отдел внутреннего контроля'), 'O5 отдел восстановлен');

-- ====================== ЭКЗАМЕНЫ ======================
select pg_temp.ra('C', $q$select upsert_skill(null, '{"name":"CAP","kind":"QUALIFICATION"}'::jsonb)$q$);
select pg_temp.ra('C', $q$select upsert_skill(null, '{"name":"Power BI","kind":"SKILL"}'::jsonb)$q$);
select pg_temp.err_as('D', $q$select upsert_skill(null, '{"name":"Левый"}'::jsonb)$q$, 'X0 VIEWER не ведёт справочник навыков', '42501');
insert into k select 'emp', id::text from employees where canonical_id='E-0001';
insert into k select 'cap', id::text from skills where name='CAP';
insert into k select 'ex1', pg_temp.rv('C', format($q$select create_exam(jsonb_build_object('employee_id', %L, 'skill_id', %s, 'exam_date', '2026-03-01'))$q$, (select id from k where name='emp'), (select id from k where name='cap')));
select pg_temp.ok((select attempt_no from exams where id=(select id::uuid from k where name='ex1')) = 1 and (select status from exams where id=(select id::uuid from k where name='ex1')) = 'SCHEDULED', 'X1 попытка 1, статус SCHEDULED');
select pg_temp.ra('C', format($q$select set_exam_result(%L, 'FAILED', 48, 'Не хватило баллов', null)$q$, (select id from k where name='ex1')));
select pg_temp.ok((select status from exams where id=(select id::uuid from k where name='ex1')) = 'COMPLETED' and (select result from exams where id=(select id::uuid from k where name='ex1')) = 'FAILED', 'X2 результат FAILED → статус COMPLETED');
insert into k select 'ex2', pg_temp.rv('C', format($q$select create_exam(jsonb_build_object('employee_id', %L, 'skill_id', %s, 'exam_date', '2026-05-01'))$q$, (select id from k where name='emp'), (select id from k where name='cap')));
select pg_temp.ok((select attempt_no from exams where id=(select id::uuid from k where name='ex2')) = 2, 'X3 пересдача получает попытку №2 автоматически');
select pg_temp.ra('C', format($q$select set_exam_result(%L, 'PASSED', 82, null, null)$q$, (select id from k where name='ex2')));
select pg_temp.ok((select result from exams where id=(select id::uuid from k where name='ex1')) = 'FAILED', 'X4 попытка №1 остаётся FAILED (история не перезаписана)');
select pg_temp.ok((select count(*) from exams where employee_id=(select id::uuid from k where name='emp') and skill_id=(select id::smallint from k where name='cap')) = 2, 'X4 две попытки хранятся отдельно');
select pg_temp.ok(exists (select 1 from employee_skills where employee_id=(select id::uuid from k where name='emp') and level='Passed' and source='EXAM'), 'X5 PASSED по квалификации добавил запись в навыки');
select pg_temp.err_as('C', format($q$select set_exam_result(%L, 'FAILED', null, null, '')$q$, (select id from k where name='ex2')), 'X6 изменение выставленного результата требует причину', 'P0012');
select pg_temp.ra('C', format($q$select set_exam_result(%L, 'OTHER', null, 'Апелляция', 'Решение апелляционной комиссии')$q$, (select id from k where name='ex2')));
select pg_temp.ok((select reason from audit_log where table_name='exams' and row_id=(select id from k where name='ex2') order by id desc limit 1) = 'Решение апелляционной комиссии', 'X6 причина изменения результата в аудите');
select pg_temp.ra('C', format($q$select set_exam_result(%L, 'PASSED', 82, null, 'Возврат результата')$q$, (select id from k where name='ex2')));
select pg_temp.err_as('D', format($q$select create_exam(jsonb_build_object('employee_id', %L, 'skill_id', %s, 'exam_date', '2026-06-01'))$q$, (select id from k where name='emp'), (select id from k where name='cap')), 'X7 VIEWER не создаёт экзамен', '42501');
select pg_temp.err_as('F', format($q$select create_exam(jsonb_build_object('employee_id', %L, 'skill_id', %s, 'exam_date', '2026-06-01'))$q$, (select id from k where name='emp'), (select id from k where name='cap')), 'X7 FINANCE не создаёт экзамен', '42501');
-- стоимость
select pg_temp.err_as('C', format($q$select set_exam_cost(%L, '{"fee":2000,"currency":"TJS"}'::jsonb)$q$, (select id from k where name='ex1')), 'X8 HR не вносит стоимость', '42501');
select pg_temp.ra('F', format($q$select set_exam_cost(%L, '{"fee":2000,"currency":"TJS","funding_source":"COMPANY"}'::jsonb)$q$, (select id from k where name='ex1')));
select pg_temp.ok(pg_temp.rv('F', format($q$select fee_tjs from exam_costs where exam_id=%L$q$, (select id from k where name='ex1')))::numeric = 2000, 'X9 стоимость 2000 TJS');
select pg_temp.ok(pg_temp.rv('C', $q$select count(*) from exam_costs$q$)::int = 0, 'X9 HR не видит стоимость экзаменов (RLS)');
select pg_temp.ok(pg_temp.rv('C', $q$select count(*) from exams$q$)::int = 2, 'X9 HR видит экзамены и результаты');
select pg_temp.ok(pg_temp.rv('D', $q$select count(*) from exam_costs$q$)::int = 1, 'X9 VIEWER видит стоимость (как расходы)');
select pg_temp.err_as('F', format($q$select set_exam_cost(%L, '{"fee":100,"currency":"EUR"}'::jsonb, 'x')$q$, (select id from k where name='ex2')), 'X10 EUR без курса — ошибка, а не 1:1', 'Нет курса');
select pg_temp.ra('F', format($q$select set_exam_cost(%L, '{"fee":100,"currency":"USD","fee_date":"2026-05-01"}'::jsonb)$q$, (select id from k where name='ex2')));
select pg_temp.ok((select fee_tjs from exam_costs where exam_id=(select id::uuid from k where name='ex2')) = 1090 and (select fx_rate from exam_costs where exam_id=(select id::uuid from k where name='ex2')) = 10.9, 'X10 USD пересчитан по реальному курсу 10.90, не 1');
select pg_temp.err_as('F', format($q$select set_exam_cost(%L, '{"fee":150,"currency":"USD"}'::jsonb, '')$q$, (select id from k where name='ex2')), 'X11 изменение стоимости требует причину', 'P0012');

-- ====================== СЕРТИФИКАТЫ, НАВЫКИ, ЦЕЛИ ======================
insert into k select 'c_active', pg_temp.rv('C', format($q$select create_certificate(jsonb_build_object('employee_id', %L, 'name', 'CAP', 'cert_type', 'EXAM', 'issuing_organization', 'CAP Org', 'issue_date', '2026-05-20', 'expiration_date', current_date + 10, 'exam_id', %L, 'certificate_number', 'CAP-1'))$q$, (select id from k where name='emp'), (select id from k where name='ex2')));
insert into k select 'c_expired', pg_temp.rv('C', format($q$select create_certificate(jsonb_build_object('employee_id', %L, 'name', 'Старый', 'issue_date', '2020-01-01', 'expiration_date', '2023-01-01'))$q$, (select id from k where name='emp')));
insert into k select 'c_forever', pg_temp.rv('C', format($q$select create_certificate(jsonb_build_object('employee_id', %L, 'name', 'Диплом', 'cert_type', 'DIPLOMA'))$q$, (select id from k where name='emp')));
select pg_temp.ok((select status from v_certificates where id=(select id::uuid from k where name='c_active')) = 'ACTIVE', 'S1 статус ACTIVE');
select pg_temp.ok((select status from v_certificates where id=(select id::uuid from k where name='c_expired')) = 'EXPIRED', 'S1 статус EXPIRED');
select pg_temp.ok((select status from v_certificates where id=(select id::uuid from k where name='c_forever')) = 'NO_EXPIRATION', 'S1 статус NO_EXPIRATION');
select pg_temp.err_as('C', format($q$select revoke_certificate(%L, true, '')$q$, (select id from k where name='c_active')), 'S2 отзыв без причины запрещён', 'P0012');
select pg_temp.ra('C', format($q$select revoke_certificate(%L, true, 'Выдан ошибочно')$q$, (select id from k where name='c_forever')));
select pg_temp.ok((select status from v_certificates where id=(select id::uuid from k where name='c_forever')) = 'REVOKED', 'S2 статус REVOKED');
select pg_temp.err_as('D', format($q$select create_certificate(jsonb_build_object('employee_id', %L, 'name', 'X'))$q$, (select id from k where name='emp')), 'S3 VIEWER не добавляет сертификат', '42501');
select pg_temp.err_as('C', format($q$select update_certificate(%L, '{"expiration_date":"2030-01-01"}'::jsonb, '')$q$, (select id from k where name='c_active')), 'S4 смена срока сертификата требует причину', 'P0012');
-- навыки: история только добавляется
select pg_temp.ra('C', format($q$select add_employee_skill(jsonb_build_object('employee_id', %L, 'skill_id', %s, 'level', 'Beginner', 'achieved_on', '2025-01-01'))$q$, (select id from k where name='emp'), (select id from skills where name='Power BI')));
select pg_temp.ra('C', format($q$select add_employee_skill(jsonb_build_object('employee_id', %L, 'skill_id', %s, 'level', 'Intermediate', 'achieved_on', '2026-01-01'))$q$, (select id from k where name='emp'), (select id from skills where name='Power BI')));
select pg_temp.ok((select count(*) from employee_skills where skill_id=(select id from skills where name='Power BI')) = 2, 'K1 повышение уровня добавило запись, старая осталась');
select pg_temp.noop_as('A', $q$update employee_skills set level='Expert'$q$, $q$select not exists (select 1 from employee_skills where level='Expert')$q$, 'K2 история навыков неизменяема (UPDATE)');
select pg_temp.noop_as('A', $q$delete from employee_skills$q$, $q$select exists (select 1 from employee_skills)$q$, 'K2 история навыков неизменяема (DELETE)');
-- цели
insert into k select 'goal', pg_temp.rv('C', format($q$select upsert_goal(null, jsonb_build_object('employee_id', %L, 'plan_year', 2026, 'title', 'Сдать CAP', 'goal_type', 'EXAM', 'exam_id', %L))$q$, (select id from k where name='emp'), (select id from k where name='ex2')));
select pg_temp.ra('C', format($q$select upsert_goal(%L, '{"status":"COMPLETED"}'::jsonb)$q$, (select id from k where name='goal')));
select pg_temp.ok((select completed_at is not null from development_goals where id=(select id::uuid from k where name='goal')), 'G1 цель выполнена: дата завершения проставлена');
select pg_temp.err_as('D', $q$select upsert_goal(null, '{"title":"x"}'::jsonb)$q$, 'G2 VIEWER не ведёт план развития', '42501');

-- ====================== ФИНАНСИРОВАНИЕ ======================
select pg_temp.err_as('E', $q$select upsert_funding_policy(null, '{"name":"P","company_coverage_percent":100,"effective_from":"2026-01-01","outcomes":{"PASSED":0,"FAILED":50}}'::jsonb)$q$, 'F1 MANAGER не создаёт политику', '42501');
insert into k select 'pol', pg_temp.rv('F', $q$select upsert_funding_policy(null, '{"name":"Оплата экзаменов 2026","scope":"EXAM","company_coverage_percent":100,"effective_from":"2026-01-01","basis":"Приказ №12","outcomes":{"PASSED":0,"FAILED":50}}'::jsonb)$q$);
select pg_temp.ok((select count(*) from funding_policy_outcomes where policy_id=(select id::uuid from k where name='pol')) = 2, 'F2 политика: исходы PASSED→0%, FAILED→50% — настраиваемые данные, не код');
insert into k select 'ag_draft', pg_temp.rv('F', format($q$select create_agreement(jsonb_build_object('employee_id', %L, 'exam_id', %L, 'company_coverage_percent', 100, 'contract_number', 'Д-5'))$q$, (select id from k where name='emp'), (select id from k where name='ex1')));
select pg_temp.err_as('F', format($q$select evaluate_agreement(%L)$q$, (select id from k where name='ag_draft')), 'F3 без политики обязательство не создаётся', 'ответственным сотрудником');
select pg_temp.err_as('F', format($q$select create_agreement(jsonb_build_object('employee_id', %L, 'exam_id', %L, 'policy_id', %L))$q$, (select id from k where name='emp'), (select id from k where name='ex1'), (select id from k where name='pol')), 'F4 неподтверждённая политика не применяется', 'не подтверждена');
select pg_temp.err_as('C', format($q$select confirm_funding_policy(%L, 'ok')$q$, (select id from k where name='pol')), 'F5 HR не подтверждает политику', '42501');
select pg_temp.ra('F', format($q$select confirm_funding_policy(%L, 'Утверждено приказом')$q$, (select id from k where name='pol')));
select pg_temp.err_as('F', format($q$update funding_policies set company_coverage_percent = 10 where id=%L$q$, (select id from k where name='pol')), 'F6 подтверждённая политика неизменяема', 'неизменяема');
select pg_temp.err_as('F', format($q$update funding_policy_outcomes set employee_responsibility_percent = 0 where policy_id=%L$q$, (select id from k where name='pol')), 'F6 исходы подтверждённой политики неизменяемы', 'неизменяема');
select pg_temp.noop_as('A', format($q$delete from funding_policies where id=%L$q$, (select id from k where name='pol')), format($q$select exists (select 1 from funding_policies where id=%L)$q$, (select id from k where name='pol')), 'F6 политику нельзя удалить');
-- договор: соглашение по неудачной попытке
insert into k select 'ag1', pg_temp.rv('F', format($q$select create_agreement(jsonb_build_object('employee_id', %L, 'exam_id', %L, 'policy_id', %L, 'contract_number', 'Д-5', 'conditions', 'При несдаче сотрудник компенсирует 50%%'))$q$, (select id from k where name='emp'), (select id from k where name='ex1'), (select id from k where name='pol')));
select pg_temp.ok((select total_cost from learning_agreements where id=(select id::uuid from k where name='ag1')) = 2000 and (select company_funded_amount from learning_agreements where id=(select id::uuid from k where name='ag1')) = 2000, 'F7 стоимость берётся из экзамена: 2000 TJS, компания 100%');
select pg_temp.ra('F', format($q$select evaluate_agreement(%L)$q$, (select id from k where name='ag1')));
select pg_temp.ok((select repayment_amount from learning_agreements where id=(select id::uuid from k where name='ag1')) = 1000
              and (select employee_responsibility_percent from learning_agreements where id=(select id::uuid from k where name='ag1')) = 50
              and (select status from learning_agreements where id=(select id::uuid from k where name='ag1')) = 'OBLIGATION_CREATED', 'F8 FAILED → сотрудник 50% = 1000 TJS, статус OBLIGATION_CREATED');
select pg_temp.ok((select reviewed_at is null from learning_agreements where id=(select id::uuid from k where name='ag1')), 'F8 обязательство ждёт проверки ответственным сотрудником');
select pg_temp.err_as('F', format($q$select record_repayment(%L, 100, current_date)$q$, (select id from k where name='ag1')), 'F9 погашение до проверки обязательства запрещено', 'проверенному');
select pg_temp.err_as('E', format($q$select review_obligation(%L, 'ok', 'ok')$q$, (select id from k where name='ag1')), 'F9 MANAGER не подтверждает обязательство', '42501');
select pg_temp.ra('F', format($q$select review_obligation(%L, 'Проверено', 'Сверено с договором')$q$, (select id from k where name='ag1')));
select pg_temp.err_as('F', format($q$update learning_agreements set status='REPAID' where id=%L$q$, (select id from k where name='ag1')), 'F10 статус прямым UPDATE не меняется', 'только через');
select pg_temp.err_as('F', format($q$update learning_agreements set total_cost = 1 where id=%L$q$, (select id from k where name='ag1')), 'F10 условия зафиксированы после расчёта', 'зафиксированы');
select pg_temp.ra('F', format($q$select record_repayment(%L, 400, current_date, 'Касса')$q$, (select id from k where name='ag1')));
select pg_temp.ok((select status from learning_agreements where id=(select id::uuid from k where name='ag1')) = 'PARTIALLY_REPAID', 'F11 частичное погашение → PARTIALLY_REPAID');
select pg_temp.err_as('F', format($q$select record_repayment(%L, 700, current_date)$q$, (select id from k where name='ag1')), 'F12 нельзя погасить больше остатка (600)', 'остаток');
select pg_temp.ra('F', format($q$select record_repayment(%L, 600, current_date)$q$, (select id from k where name='ag1')));
select pg_temp.ok((select status from learning_agreements where id=(select id::uuid from k where name='ag1')) = 'REPAID', 'F13 полное погашение → REPAID');
select pg_temp.noop_as('F', format($q$delete from agreement_repayments where agreement_id=%L$q$, (select id from k where name='ag1')), format($q$select exists (select 1 from agreement_repayments where agreement_id=%L)$q$, (select id from k where name='ag1')), 'F14 погашения нельзя удалить');
select pg_temp.ra('F', format($q$select void_repayment(%L, 'Ошибочная сумма')$q$, (select id from agreement_repayments order by amount desc limit 1)::text));
select pg_temp.ok((select status from learning_agreements where id=(select id::uuid from k where name='ag1')) = 'PARTIALLY_REPAID', 'F14 аннулирование погашения возвращает статус');
select pg_temp.err_as('F', format($q$select cancel_agreement(%L, 'x')$q$, (select id from k where name='ag1')), 'F15 отмена при активных погашениях запрещена', 'погашения');
-- успешная попытка: обязательства нет
insert into k select 'ag2', pg_temp.rv('F', format($q$select create_agreement(jsonb_build_object('employee_id', %L, 'exam_id', %L, 'policy_id', %L, 'total_cost', 100, 'currency', 'USD', 'cost_date', '2026-05-01', 'contract_number', 'Д-6'))$q$, (select id from k where name='emp'), (select id from k where name='ex2'), (select id from k where name='pol')));
select pg_temp.ra('F', format($q$select evaluate_agreement(%L)$q$, (select id from k where name='ag2')));
select pg_temp.ok((select repayment_amount from learning_agreements where id=(select id::uuid from k where name='ag2')) = 0 and (select status from learning_agreements where id=(select id::uuid from k where name='ag2')) = 'COMPLETED', 'F16 PASSED → ответственность сотрудника 0%, статус COMPLETED');
select pg_temp.ok((select total_cost_tjs from learning_agreements where id=(select id::uuid from k where name='ag2')) = 1090, 'F16 USD пересчитан по курсу 10.90 (не 1)');
-- доступ
select pg_temp.ok(pg_temp.rv('C', $q$select count(*) from learning_agreements$q$)::int = 0, 'F17 HR не видит соглашения и обязательства');
select pg_temp.ok(pg_temp.rv('D', $q$select count(*) from learning_agreements$q$)::int = 0, 'F17 VIEWER не видит персональные обязательства');
select pg_temp.ok(pg_temp.rv('E', $q$select count(*) from learning_agreements$q$)::int = (select count(*) from learning_agreements), 'F17 MANAGER видит все соглашения');
select pg_temp.err_as('C', format($q$select evaluate_agreement(%L)$q$, (select id from k where name='ag1')), 'F18 HR не рассчитывает обязательства', '42501');
-- политика без исхода для результата
select pg_temp.ra('E', format($q$select set_exam_result(%L, 'NOT_ATTENDED', null, null, 'Не явился')$q$, (select id from k where name='ex1')));
insert into k select 'ag3', pg_temp.rv('F', format($q$select create_agreement(jsonb_build_object('employee_id', %L, 'exam_id', %L, 'policy_id', %L, 'total_cost', 500, 'contract_number', 'Д-7'))$q$, (select id from k where name='emp'), (select id from k where name='ex1'), (select id from k where name='pol')));
select pg_temp.err_as('F', format($q$select evaluate_agreement(%L)$q$, (select id from k where name='ag3')), 'F19 нет правила для исхода NOT_ATTENDED → требуется проверка человеком', 'нет правила');
select pg_temp.ra('E', format($q$select set_exam_result(%L, 'FAILED', null, null, 'Возврат результата')$q$, (select id from k where name='ex1')));
select pg_temp.ok(not exists (select 1 from information_schema.tables where table_schema='public' and table_name ilike '%payroll%'), 'F20 интеграции с зарплатой нет (таблиц payroll нет)');

-- ====================== ДОКУМЕНТЫ И STORAGE ======================
insert into k select 'doc_cert', (pg_temp.rv('C', format($q$select register_document(jsonb_build_object('doc_type','CERTIFICATE','title','Сертификат CAP','file_name','cap.pdf','mime_type','application/pdf','size_bytes',1000,'employee_id',%L))::text$q$, (select id from k where name='emp')))::jsonb->>'id');
select pg_temp.err_as('C', format($q$select register_document(jsonb_build_object('doc_type','CONTRACT','title','Договор','file_name','d.pdf','mime_type','application/pdf','size_bytes',1000,'employee_id',%L))$q$, (select id from k where name='emp')), 'D1 HR не загружает договор (финансовый документ)', '42501');
insert into k select 'doc_contract', (pg_temp.rv('F', format($q$select register_document(jsonb_build_object('doc_type','CONTRACT','title','Договор №5','file_name','d.pdf','mime_type','application/pdf','size_bytes',2000,'employee_id',%L,'expires_on','2026-12-31'))::text$q$, (select id from k where name='emp')))::jsonb->>'id');
select pg_temp.err_as('D', format($q$select register_document(jsonb_build_object('doc_type','OTHER','title','x','file_name','d.pdf','mime_type','application/pdf','size_bytes',1,'employee_id',%L))$q$, (select id from k where name='emp')), 'D2 VIEWER не загружает документы', '42501');
select pg_temp.err_as('C', format($q$select register_document(jsonb_build_object('doc_type','OTHER','title','x','file_name','a.exe','mime_type','application/x-msdownload','size_bytes',1,'employee_id',%L))$q$, (select id from k where name='emp')), 'D3 тип файла вне списка отклонён', 'не поддерживается');
select pg_temp.err_as('C', format($q$select register_document(jsonb_build_object('doc_type','OTHER','title','x','file_name','a.pdf','mime_type','application/pdf','size_bytes',99999999,'employee_id',%L))$q$, (select id from k where name='emp')), 'D3 файл больше 20 МБ отклонён', 'P0015');
select pg_temp.err_as('C', $q$select register_document('{"doc_type":"OTHER","title":"x","file_name":"a.pdf","mime_type":"application/pdf","size_bytes":1}'::jsonb)$q$, 'D4 документ без связи отклонён', 'Свяжите');
select pg_temp.ok(pg_temp.rv('C', $q$select count(*) from documents$q$)::int = 1, 'D5 HR видит только нефинансовые документы');
select pg_temp.ok(pg_temp.rv('D', $q$select count(*) from documents$q$)::int = 0, 'D5 VIEWER файлов не видит');
select pg_temp.ok(pg_temp.rv('F', $q$select count(*) from documents$q$)::int = 2, 'D5 FINANCE видит нефинансовые и финансовые документы');
select pg_temp.err_as('C', format($q$select confirm_document(%L)$q$, (select id from k where name='doc_cert')), 'D6 без файла в Storage подтверждение невозможно', 'не загружен');
-- файл кладётся под сессией автора в зарегистрированный путь
insert into k select 'path_cert', storage_path from documents where id=(select id::uuid from k where name='doc_cert');
insert into k select 'path_contract', storage_path from documents where id=(select id::uuid from k where name='doc_contract');
select pg_temp.ra('C', format($q$insert into storage.objects(bucket_id, name, owner) values ('tms-documents', %L, auth.uid())$q$, (select id from k where name='path_cert')));
select pg_temp.ok((select count(*) from storage.objects where name=(select id from k where name='path_cert')) = 1, 'D7 автор загрузил файл в свой зарегистрированный путь');
select pg_temp.err_as('E', format($q$insert into storage.objects(bucket_id, name, owner) values ('tms-documents', %L, auth.uid())$q$, (select id from k where name='path_contract')), 'D8 чужой документ: загрузка в путь запрещена', 'row-level security');
select pg_temp.err_as('C', $q$insert into storage.objects(bucket_id, name, owner) values ('tms-documents', 'произвольный/путь.pdf', auth.uid())$q$, 'D8 загрузка в незарегистрированный путь запрещена', 'row-level security');
select pg_temp.ra('C', format($q$select confirm_document(%L)$q$, (select id from k where name='doc_cert')));
select pg_temp.ok((select status from documents where id=(select id::uuid from k where name='doc_cert')) = 'UPLOADED', 'D9 после загрузки документ подтверждён');
select pg_temp.ok(pg_temp.rv('C', format($q$select count(*) from storage.objects where name=%L$q$, (select id from k where name='path_cert')))::int = 1, 'D10 HR читает файл нефинансового документа');
insert into storage.objects(bucket_id, name, owner) values ('tms-documents', (select id from k where name='path_contract'), (select uid from (select pg_temp.uid('F') uid) x)::uuid);
select pg_temp.ok(pg_temp.rv('C', format($q$select count(*) from storage.objects where name=%L$q$, (select id from k where name='path_contract')))::int = 0, 'D10 HR не читает файл договора (Storage policy)');
select pg_temp.ok(pg_temp.rv('F', format($q$select count(*) from storage.objects where name=%L$q$, (select id from k where name='path_contract')))::int = 1, 'D10 FINANCE читает файл договора');
select pg_temp.ok(pg_temp.rv('D', $q$select count(*) from storage.objects$q$)::int = 0, 'D10 VIEWER файлов не видит');
select pg_temp.expect_error($$select pg_temp.anon_($q$select count(*) from documents$q$)$$, 'D11 anon не читает documents', '42501');
select pg_temp.err_as('C', format($q$update documents set file_name='x.pdf' where id=%L$q$, (select id from k where name='doc_cert')), 'D12 метаданные файла неизменяемы', 'не изменяются');
select pg_temp.err_as('C', format($q$select archive_document(%L, true, '')$q$, (select id from k where name='doc_cert')), 'D13 архивирование требует причину', 'P0012');
select pg_temp.ra('C', format($q$select archive_document(%L, true, 'Заменён новым')$q$, (select id from k where name='doc_cert')));
select pg_temp.ok((select archived_at is not null from documents where id=(select id::uuid from k where name='doc_cert')) and (select count(*) from storage.objects where name=(select id from k where name='path_cert')) = 1, 'D13 архив: метаданные помечены, файл сохранён');
select pg_temp.err_as('C', format($q$delete from storage.objects where name=%L$q$, (select id from k where name='path_cert')), 'D14 удалять объекты Storage нельзя', 'permission denied');

-- ====================== ПУБЛИЧНЫЕ ЗАЯВКИ ======================
select pg_temp.err_as('C', $q$select submit_public_request(null, '{}'::jsonb, 'client-123456')$q$, 'P1 авторизованный пользователь не вызывает публичную функцию напрямую', 'permission denied');
select pg_temp.ok((select coalesce(pg_temp.anon_($q$select has_function_privilege('anon', 'submit_public_request(text,jsonb,text)', 'execute')$q$), 'f') = 'false'), 'P1 anon не имеет EXECUTE на публичную функцию');
select pg_temp.ok(not has_table_privilege('anon', 'training_requests', 'select'), 'P1 anon не имеет доступа к training_requests');
do $$ begin
  begin set local role anon; perform count(*) from training_requests;
    insert into res(name, ok, detail) values ('P2 anon читает training_requests', false, 'не было ошибки');
  exception when others then insert into res(name, ok) values ('P2 anon не читает training_requests (permission denied/RLS)', sqlstate in ('42501')); end;
  reset role;
end $$;
do $$ begin
  begin set local role anon; insert into training_requests(canonical_id, plan_year, topic) values ('X',2026,'x');
    insert into res(name, ok, detail) values ('P2 anon пишет в training_requests', false, 'не было ошибки');
  exception when others then insert into res(name, ok) values ('P2 anon не пишет в training_requests', sqlstate in ('42501')); end;
  reset role;
end $$;
select pg_temp.ok(pg_temp.rv('E', $q$select count(*) from request_links$q$)::int = 0, 'P3 токены ссылок видит только ADMIN');
select pg_temp.err_as('E', $q$select create_request_link('{"label":"x"}'::jsonb)$q$, 'P3 MANAGER не создаёт ссылки', '42501');
-- общая форма закрыта по умолчанию
select pg_temp.expect_error($$select pg_temp.svc($q$select submit_public_request(null, '{"requester_name":"Тест Тестов","topic":"Тема заявки","goal":"Цель обучения","department_id":1,"participants_planned":5}'::jsonb, 'client-aaaaaaaa')$q$)$$, 'P4 общая форма закрыта по умолчанию', 'P0018');
insert into k select 'dept_fin', id::text from org_units where name='Финансовый департамент';
insert into k select 'dept_law', id::text from org_units where name='Юридический департамент';
insert into k select 'lnk', pg_temp.rv('A', format($q$select create_request_link(jsonb_build_object('label','Финансовый департамент','org_unit_id', %L))$q$, (select id from k where name='dept_fin')));
insert into k select 'tok', token from request_links where id=(select id::uuid from k where name='lnk');
select pg_temp.ok(length((select id from k where name='tok')) = 48, 'P5 токен: 24 случайных байта (48 hex)');
select pg_temp.ok((pg_temp.svc(format($q$select (public_request_options(%L)->>'mode')$q$, (select id from k where name='tok')))) = 'DEPARTMENT', 'P5 ссылка департамента даёт форму с его подразделением');
select pg_temp.ok(jsonb_array_length(pg_temp.svc(format($q$select (public_request_options(%L)->'departments')::text$q$, (select id from k where name='tok')))::jsonb) = 1, 'P5 для ссылки департамента виден только он');
insert into k select 'req_code', pg_temp.svc(format($q$select (submit_public_request(%L, jsonb_build_object('requester_name','Каримов Фаррух','topic','Excel для финансистов','goal','Ускорить отчётность','participants_planned',12,'format','OFFLINE','period','III квартал','department_id',%s,'contact','+992 900 11 22 33'), 'client-aaaaaaaa')->>'code')$q$, (select id from k where name='tok'), (select id from k where name='dept_law')));
select pg_temp.ok((select id from k where name='req_code') ~ '^REQ-\d{4}-\d{3}$', 'P6 заявка получила код REQ-ГГГГ-NNN');
select pg_temp.ok((select department_id from training_requests where canonical_id=(select id from k where name='req_code')) = (select id::bigint from k where name='dept_fin'), 'P6 подразделение берётся из ссылки, а не из тела запроса (подмена игнорируется)');
select pg_temp.ok((select status::text||submitted_via from training_requests where canonical_id=(select id from k where name='req_code')) = 'NEWPUBLIC', 'P6 статус NEW (на рассмотрении), канал PUBLIC');
select pg_temp.ok((select uses_count from request_links where id=(select id::uuid from k where name='lnk')) = 1, 'P7 счётчик использований ссылки');
select pg_temp.ok(pg_temp.rv('C', $q$select count(*) from training_requests where submitted_via='PUBLIC'$q$)::int = 1, 'P7 заявка видна сотрудникам TMS по RLS');
select pg_temp.expect_error(format($$select pg_temp.svc($q$select submit_public_request(%L, '{"requester_name":"Т","topic":"Тема","goal":"Цель","participants_planned":0}'::jsonb, 'client-bbbbbbbb')$q$)$$, (select id from k where name='tok')), 'P8 серверная валидация отклоняет слабую заявку', 'P0015');
select pg_temp.expect_error($$select pg_temp.svc($q$select submit_public_request('нет-такого-токена', '{}'::jsonb, 'client-cccccccc')$q$)$$, 'P8 неверный токен отклонён', 'P0018');
-- ограничение частоты: 5 в час с клиента (одна уже была)
do $$ declare i int; begin
  for i in 1..4 loop
    perform pg_temp.svc(format($q$select submit_public_request(%L, jsonb_build_object('requester_name','Каримов Фаррух','topic','Тема заявки номер %s','goal','Цель обучения','participants_planned',3,'department_id',1), 'client-aaaaaaaa')::text$q$, (select id from k where name='tok'), i));
  end loop;
end $$;
select pg_temp.expect_error(format($$select pg_temp.svc($q$select submit_public_request(%L, '{"requester_name":"Каримов Фаррух","topic":"Шестая заявка","goal":"Цель обучения","participants_planned":3}'::jsonb, 'client-aaaaaaaa')$q$)$$, (select id from k where name='tok')), 'P9 шестая заявка за час с одного клиента блокируется (rate limit)', 'P0019');
select pg_temp.ok(pg_temp.svc(format($q$select (submit_public_request(%L, jsonb_build_object('requester_name','Другой Клиент','topic','Заявка другого клиента','goal','Цель обучения','participants_planned',3), 'client-dddddddd')->>'code')$q$, (select id from k where name='tok'))) is not null, 'P9 другой клиент не затронут лимитом');
-- переименование подразделения: ссылка работает
select pg_temp.ra('C', format($q$select rename_org_unit(%s, 'Департамент финансов', 'Новое название')$q$, (select id from k where name='dept_fin')));
select pg_temp.ok((pg_temp.svc(format($q$select (public_request_options(%L)->'departments'->0->>'name')$q$, (select id from k where name='tok')))) = 'Департамент финансов', 'P10 после переименования ссылка работает и показывает новое имя');
-- отключение и деактивация
select pg_temp.ra('A', format($q$select set_request_link_active(%L, false, 'Отключаем')$q$, (select id from k where name='lnk')));
select pg_temp.ok(pg_temp.svc(format($q$select coalesce((public_request_options(%L))::text, 'null')$q$, (select id from k where name='tok'))) = 'null', 'P11 отключённая ссылка не открывает форму');
select pg_temp.ra('A', format($q$select set_request_link_active(%L, true, 'Включаем')$q$, (select id from k where name='lnk')));
select pg_temp.err_as('A', format($q$select set_org_unit_active(%s, false, 'Реорганизация')$q$, (select id from k where name='dept_fin')), 'P11a нельзя деактивировать департамент с действующими отделами', 'деактивируйте');
do $$ declare u bigint; begin for u in select id from org_units where parent_id=(select id::bigint from k where name='dept_fin') loop
  perform pg_temp.ra('A', format($q$select set_org_unit_active(%s, false, 'Реорганизация')$q$, u)); end loop; end $$;
select pg_temp.ra('A', format($q$select set_org_unit_active(%s, false, 'Реорганизация')$q$, (select id from k where name='dept_fin')));
select pg_temp.ok(pg_temp.svc(format($q$select coalesce((public_request_options(%L))::text, 'null')$q$, (select id from k where name='tok'))) = 'null', 'P12 деактивированное подразделение закрывает ссылку');

-- ====================== ИМПОРТЫ ======================
insert into k select 'job_e', pg_temp.rv('C', $q$select import_stage('EMPLOYEES','XLSX','staff.xlsx','h1','{}'::jsonb,'{}'::jsonb, '[
  {"row_no":2,"data":{"full_name":"Новиков Нурали","employee_code":"N0001","position":"Экономист"}},
  {"row_no":3,"data":{"full_name":"Азамов Фаррух","employee_code":"X1001","position":"Старший юрист"}},
  {"row_no":4,"data":{"full_name":"Азамов Фаррух","employee_code":"X1001","position":"Юрист"}},
  {"row_no":5,"data":{"full_name":"Новиков Нурали","employee_code":"N0001","position":"Экономист"}},
  {"row_no":6,"data":{"full_name":"","employee_code":""}},
  {"row_no":7,"data":{"full_name":"Иванов Иван"}}
]'::jsonb)$q$);
select pg_temp.ok((select new_rows from import_jobs where id=(select id::uuid from k where name='job_e')) >= 1, 'I1 импорт сотрудников: есть NEW');
select pg_temp.ok((select error_rows from import_jobs where id=(select id::uuid from k where name='job_e')) = 1, 'I1 пустая строка — ERROR');
select pg_temp.ok((select status from import_job_rows where job_id=(select id::uuid from k where name='job_e') and row_no=5) = 'DUPLICATE', 'I2 повтор строки в файле — DUPLICATE');
select pg_temp.ok((select status from import_job_rows where job_id=(select id::uuid from k where name='job_e') and row_no=3) = 'UPDATED', 'I3 существующий по табельному номеру — UPDATED');
select pg_temp.ok((select status from import_job_rows where job_id=(select id::uuid from k where name='job_e') and row_no=7) = 'NEEDS_REVIEW', 'I4 неоднозначное ФИО (два Ивановых) — NEEDS_REVIEW');
select pg_temp.ok((select count(*) from dq_issues where source='IMPORT' and status='OPEN') >= 1, 'I4 NEEDS_REVIEW создаёт проблему DQ');
select pg_temp.ok((select count(*) from employees where employee_code='N0001') = 0, 'I5 до commit ничего не записано в employees (dry run)');
select pg_temp.err_as('D', format($q$select import_commit(%L, 'x')$q$, (select id from k where name='job_e')), 'I6 VIEWER не видит и не применяет чужой импорт', 'P0015');
select pg_temp.ra('C', format($q$select import_resolve_row(%s, 'SKIP')$q$, (select id from import_job_rows where job_id=(select id::uuid from k where name='job_e') and row_no=7)));
select pg_temp.ok((select count(*) from dq_issues where source='IMPORT' and status='OPEN' and entity_id = (select id::text from import_job_rows where job_id=(select id::uuid from k where name='job_e') and row_no=7)) = 0, 'I8 решение по строке закрывает проблему DQ');
select pg_temp.ra('C', format($q$select import_commit(%L, 'Первичная загрузка')$q$, (select id from k where name='job_e')));
select pg_temp.ok((select count(*) from employees where full_name='Иванов Иван') = 2, 'I7 нерешённая неоднозначная строка при commit пропущена (не создана и не слита)');
select pg_temp.ok((select count(*) from employees where employee_code='N0001') = 1, 'I9 commit создал нового сотрудника ровно один раз');
select pg_temp.ok((select position from employees where employee_code='X1001') = 'Юрист' or (select position from employees where employee_code='X1001') = 'Старший юрист', 'I9 существующий сотрудник обновлён, не продублирован');
select pg_temp.ok((select count(*) from employees where employee_code='X1001') = 1, 'I9 дубль по коду не создан');
select pg_temp.ok((select status from import_jobs where id=(select id::uuid from k where name='job_e')) = 'COMMITTED', 'I10 задача в статусе COMMITTED');
select pg_temp.err_as('C', format($q$select import_commit(%L, 'x')$q$, (select id from k where name='job_e')), 'I11 повторный commit запрещён', 'P0015');
select pg_temp.ok(exists (select 1 from audit_log where table_name='employees' and reason = 'Первичная загрузка'), 'I12 импорт записан в аудит с причиной');
-- участники: сотрудников не создаём
insert into k select 'job_p', pg_temp.rv('E', format($q$select import_stage('PARTICIPANTS','PASTE','list.csv','h2', jsonb_build_object('training_id', %L), jsonb_build_object('training_id', %L), '[
  {"row_no":1,"data":{"full_name":"Азамов Фаррух","employee_code":"X1001"}},
  {"row_no":2,"data":{"full_name":"Несуществующий Человек"}}
]'::jsonb)$q$, (select id from k where name='plain'), (select id from k where name='plain')));
select pg_temp.ok((select status from import_job_rows where job_id=(select id::uuid from k where name='job_p') and row_no=2) = 'NEEDS_REVIEW', 'I13 неизвестный человек в списке участников — NEEDS_REVIEW, а не создание');
select pg_temp.err_as('E', format($q$select import_resolve_row(%s, 'APPLY')$q$, (select id from import_job_rows where job_id=(select id::uuid from k where name='job_p') and row_no=2)), 'I13 «создать» для участника запрещено', 'P0015');
select pg_temp.ra('E', format($q$select import_resolve_row(%s, 'SKIP')$q$, (select id from import_job_rows where job_id=(select id::uuid from k where name='job_p') and row_no=2)));
select pg_temp.ra('E', format($q$select import_commit(%L, 'Список')$q$, (select id from k where name='job_p')));
select pg_temp.ok((select count(*) from training_participants where training_id=(select id::uuid from k where name='plain')) = 1, 'I14 из списка добавлен один участник');
select pg_temp.ok((select count(*) from employees where full_name='Несуществующий Человек') = 0, 'I14 сотрудник не создан из списка участников');
-- повторный импорт того же списка не дублирует участника
insert into k select 'job_p2', pg_temp.rv('E', format($q$select import_stage('PARTICIPANTS','PASTE','list.csv','h2', '{}'::jsonb, jsonb_build_object('training_id', %L), '[{"row_no":1,"data":{"full_name":"Азамов Фаррух","employee_code":"X1001"}}]'::jsonb)$q$, (select id from k where name='plain')));
select pg_temp.ra('E', format($q$select import_commit(%L, 'Повтор')$q$, (select id from k where name='job_p2')));
select pg_temp.ok((select count(*) from training_participants where training_id=(select id::uuid from k where name='plain')) = 1, 'I15 уникальность участника сохраняется при повторном импорте');
-- расходы: HR не импортирует
select pg_temp.err_as('C', $q$select import_stage('EXPENSES','XLSX','e.xlsx','h3','{}'::jsonb,'{}'::jsonb,'[{"row_no":1,"data":{"amount":100}}]'::jsonb)$q$, 'I16 HR не импортирует расходы', '42501');
-- отмена
insert into k select 'job_c', pg_temp.rv('C', $q$select import_stage('EMPLOYEES','XLSX','c.xlsx','h4','{}'::jsonb,'{}'::jsonb,'[{"row_no":1,"data":{"full_name":"Отменённый Сотрудник","employee_code":"C0001"}}]'::jsonb)$q$);
select pg_temp.ra('C', format($q$select import_cancel(%L, 'Ошибочный файл')$q$, (select id from k where name='job_c')));
select pg_temp.ok((select status from import_jobs where id=(select id::uuid from k where name='job_c')) = 'CANCELLED' and (select count(*) from employees where employee_code='C0001') = 0, 'I17 отменённый импорт ничего не записывает');

-- ====================== МАССОВЫЕ ДЕЙСТВИЯ ======================
select pg_temp.ra('C', format($q$select bulk_update_employees(array(select id from employees where employee_code in ('T0001','T0002','T0003')), '{"position":"Старший бухгалтер"}'::jsonb, 'Массовое повышение')$q$));
select pg_temp.ok((select count(*) from employees where position='Старший бухгалтер') = 3, 'B1 массовое обновление трёх сотрудников');
select pg_temp.ok((select count(*) from audit_log where table_name='employees' and reason='Массовое повышение') >= 3, 'B1 каждый сотрудник в аудите с причиной');
select pg_temp.err_as('C', $q$select bulk_update_employees(array[]::uuid[], '{}'::jsonb, 'x')$q$, 'B2 пустой выбор отклонён', 'P0015');
select pg_temp.err_as('C', format($q$select bulk_update_employees(array(select id from employees limit 2), '{"position":"Х"}'::jsonb, '')$q$), 'B3 без причины запрещено', 'P0012');
select pg_temp.err_as('D', format($q$select bulk_update_employees(array(select id from employees limit 2), '{"position":"Х"}'::jsonb, 'r')$q$), 'B4 VIEWER не выполняет массовые действия', '42501');
-- результат участника
select pg_temp.ra('E', format($q$select set_participant_result(%L, 'PASSED', 'Сдал', 'Итог')$q$, (select id from training_participants where training_id=(select id::uuid from k where name='plain') limit 1)));
select pg_temp.ok((select result from training_participants where training_id=(select id::uuid from k where name='plain') limit 1) = 'PASSED', 'B5 результат участника записан');

-- ====================== УВЕДОМЛЕНИЯ / ВНИМАНИЕ / ПОИСК ======================
select pg_temp.ok(pg_temp.rv('A', $q$select notify_scan()$q$)::int >= 0, 'N1 notify_scan выполняется');
select pg_temp.ok(pg_temp.rv('A', $q$select notify_scan()$q$)::int = 0, 'N2 повторный пересчёт в течение минуты ничего не делает (throttle)');
select pg_temp.ok(exists (select 1 from notifications where type like 'CERT%'), 'N3 есть уведомление по сертификатам (истекает/истёк)');
select pg_temp.ok((select count(*) from notifications) = (select count(distinct dedupe_key) from notifications), 'N4 уведомления не дублируются');
select pg_temp.ok(pg_temp.rv('A', $q$select count(*) from attention_summary()$q$)::int >= 1, 'N5 «Требует внимания» возвращает строки');
select pg_temp.ok(pg_temp.rv('A', $q$select count(*) from attention_summary() where href is null$q$)::int = 0, 'N5 каждая строка «Требует внимания» ведёт по ссылке');
select pg_temp.ok(pg_temp.rv('A', $q$select count(*) from global_search('Азамов', 8)$q$)::int >= 1, 'S1 глобальный поиск находит сотрудника');
select pg_temp.ok(pg_temp.rv('A', $q$select count(*) from global_search('Семинар', 8) where kind='training'$q$)::int >= 1 or pg_temp.rv('A', $q$select count(*) from global_search('Семинар', 8)$q$)::int >= 1, 'S2 глобальный поиск находит мероприятие');
select pg_temp.ok(pg_temp.rv('A', $q$select count(*) from global_search('x', 8)$q$)::int >= 0, 'S3 короткий запрос не падает');
select pg_temp.ok(pg_temp.rv('D', $q$select count(*) from global_search('Азамов', 8) where kind in ('agreement','policy')$q$)::int = 0, 'S4 VIEWER не видит договоры финансирования в поиске');

-- ====================== DATA QUALITY ======================
select pg_temp.ra('A', $q$select dq_scan()$q$);
select pg_temp.ok(exists (select 1 from dq_issues where rule_code in ('CERT_EXPIRED','CERT_EXPIRING') and status='OPEN'), 'Q1 DQ: сертификаты с истёкшим/истекающим сроком');
select pg_temp.ok(exists (select 1 from dq_issues where rule_code='EMPLOYEE_DUPLICATE_NAME'), 'Q2 DQ: дубли ФИО в справочнике сотрудников');
select pg_temp.ok((select count(*) from dq_issues where status in ('OPEN','IN_REVIEW') and details is null) = 0, 'Q3 у каждой открытой проблемы есть детали для действий');
select pg_temp.ok((select count(*) from dq_issues where status in ('OPEN','IN_REVIEW') and suggestion is null and source='RULE') = 0, 'Q3 у каждой проблемы есть подсказка, что делать');
select pg_temp.ra('A', $q$select dq_scan()$q$);
select pg_temp.ok((select count(*) from dq_issues where source='RULE') = (select count(distinct fingerprint) from dq_issues where source='RULE'), 'Q4 повторный скан не плодит дубликаты');

-- ====================== АУДИТ ======================
select pg_temp.ok((select count(*) from audit_log where table_name in ('exams','certificates','learning_agreements','documents','request_links','import_jobs')) > 0, 'U1 новые таблицы пишут аудит');
select pg_temp.ok(not has_table_privilege('authenticated','audit_log','update') and not has_table_privilege('authenticated','audit_log','delete'), 'U2 аудит неизменяем для пользователей');
select pg_temp.err_as('A', $q$delete from audit_log$q$, 'U3 ADMIN не удаляет аудит', 'permission denied');
select pg_temp.ok(pg_temp.rv('F', format($q$select count(*) from entity_audit('learning_agreements', %L)$q$, (select id from k where name='ag1')))::int >= 1, 'U4 FINANCE видит аудит договора финансирования');
select pg_temp.ok(pg_temp.rv('C', format($q$select count(*) from entity_audit('learning_agreements', %L)$q$, (select id from k where name='ag1')))::int = 0, 'U5 HR не видит аудит договора финансирования');
select pg_temp.ok(pg_temp.rv('C', format($q$select count(*) from entity_audit('employees', %L) where table_name='documents' and (new_row->>'doc_type') in ('CONTRACT','INVOICE','ACT','PAYMENT_DOCUMENT','AGREEMENT')$q$, (select id from k where name='emp')))::int = 0, 'U6 HR не видит аудит финансовых документов в ленте сотрудника');

-- ====================== ДОСЬЕ ======================
select pg_temp.ok(pg_temp.rv('C', format($q$select count(*) from employee_timeline(%L)$q$, (select id from k where name='emp')))::int >= 1, 'T1 хронология сотрудника не пуста');
select pg_temp.ok(pg_temp.rv('C', format($q$select events_count from employee_learning_summary(%L)$q$, (select id from k where name='emp'))) is not null, 'T2 сводка по обучению сотрудника');
select pg_temp.ok(pg_temp.rv('C', format($q$select (company_spent_tjs is null and individual_education_tjs is null and outstanding_obligation_tjs is null)::text from employee_learning_summary(%L)$q$, (select id from k where name='emp'))) = 'true', 'T3 HR не получает суммы затрат в сводке');
select pg_temp.ok(pg_temp.rv('F', format($q$select (company_spent_tjs is not null)::text from employee_learning_summary(%L)$q$, (select id from k where name='emp'))) = 'true', 'T3 FINANCE получает суммы затрат');

-- ====================== ИТОГ ======================
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
