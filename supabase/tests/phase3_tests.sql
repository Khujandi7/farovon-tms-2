-- Тесты Phase 3A (M10–M13): модель тренинга, посещаемость, RPC, права, аудит с причиной, откат, Data Quality.
-- Только локально (используют DELETE и bootstrap профилей). Заканчивается намеренной ошибкой RESULT (откат).

create temp table res(n serial, name text, ok boolean, detail text);

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin insert into res(name, ok) values (p_name, p_cond is true); end $$;

create or replace function pg_temp.expect_error(p_sql text, p_name text, p_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_like is not null and sqlerrm not like '%'||p_like||'%' and sqlstate <> p_like then
      insert into res(name, ok, detail) values (p_name, false, 'другая ошибка: '||sqlstate||' '||sqlerrm);
    else
      insert into res(name, ok) values (p_name, true);
    end if;
    return;
  end;
  insert into res(name, ok, detail) values (p_name, false, 'ожидалась ошибка, её не было');
end $$;

create or replace function pg_temp.as_user(p_uid text, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute 'select count(*) from ('||p_sql||') q' into n;
  reset role;
  return n;
end $$;
create or replace function pg_temp.val_as(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  return v;
end $$;
create or replace function pg_temp.write_as(p_uid text, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

-- ---------- Данные ----------
alter table profiles alter constraint profiles_id_fkey deferrable initially deferred;
insert into profiles(id,full_name,role,is_active) values
  ('00000000-0000-0000-0000-00000000000a','Админ','ADMIN',true),
  ('00000000-0000-0000-0000-00000000000e','Менеджер','ACADEMY_MANAGER',true),
  ('00000000-0000-0000-0000-00000000000c','Кадровик','HR',true),
  ('00000000-0000-0000-0000-00000000000f','Финансист','FINANCE',true),
  ('00000000-0000-0000-0000-00000000000d','Наблюдатель','VIEWER',true);
-- uid-псевдонимы: A=ADMIN, E=MANAGER, C=HR, F=FINANCE, D=VIEWER

insert into expense_categories(code,name,group_code,is_trainer_fee) values
  ('RENT','Аренда помещения','ORG',false),('FEE','Гонорар тренера','TRAINER',true),('OTHER','Доп. расходы','ORG',false);
insert into org_units(name, level) values ('Финансовый департамент','DEPARTMENT'),('Юридический департамент','DEPARTMENT');
insert into org_units(parent_id, name, level) select id,'Отдел внутреннего контроля','UNIT' from org_units where name='Финансовый департамент';
insert into employees(canonical_id, full_name, name_norm, department_id, unit_id, position)
select 'E-'||lpad(g::text,4,'0'), 'Сотрудник '||g, 'сотрудник '||g,
       (select id from org_units where name='Финансовый департамент'),
       (select id from org_units where name='Отдел внутреннего контроля'), 'Специалист'
from generate_series(1,60) g;
insert into fx_rates values ('2026-02-20','USD',10.90,'тест'),('2026-03-10','USD',11.00,'тест');
delete from audit_log;

-- ====================== РЕГРЕССИЯ: реестр №7 + №8 ======================
insert into trainings(canonical_id,legacy_reestr_id,title,format,kind,hours,start_date,end_date,status,source_type)
values ('T-0007',7,'Системное мышление','OFFLINE','EXTERNAL',32,'2025-07-13','2025-07-26','COMPLETED','UNPLANNED');
insert into training_sessions(training_id,session_no,start_date,end_date,hours,legacy_reestr_id) values
  ((select id from trainings where canonical_id='T-0007'),1,'2025-07-13','2025-07-16',16,8),
  ((select id from trainings where canonical_id='T-0007'),2,'2025-07-23','2025-07-26',16,7);
insert into training_participants(training_id,session_id,employee_id)
select (select id from trainings where canonical_id='T-0007'),
       (select id from training_sessions where session_no = case when rn<=26 then 1 else 2 end),
       id
from (select id, row_number() over (order by canonical_id) rn from employees) e where rn<=50;
insert into expense_operations(training_id,category_id,amount,operation_date)
values ((select id from trainings where canonical_id='T-0007'),(select id from expense_categories where code='FEE'),57128,'2025-07-26'),
       ((select id from trainings where canonical_id='T-0007'),(select id from expense_categories where code='OTHER'),63957,'2025-07-26');

select pg_temp.ok(participants_count((select id from trainings where canonical_id='T-0007')) = 50, 'R1 #7+#8: 50 уникальных участников');
select pg_temp.ok(man_hours((select id from trainings where canonical_id='T-0007')) = 800, 'R1 #7+#8: 800 человеко-часов (legacy-расчёт)');
select pg_temp.ok((select hours from trainings where canonical_id='T-0007') = 32, 'R1 часы тренинга = сумме заходов = 32');
select pg_temp.ok((select department_snapshot from training_participants limit 1) = 'Финансовый департамент'
              and (select unit_snapshot from training_participants limit 1) = 'Отдел внутреннего контроля', 'M10 снимок подразделения/отдела заполнен триггером');
select pg_temp.ok(not has_attendance((select id from trainings where canonical_id='T-0007')), 'M10 у импортированного тренинга режим посещаемости не включён');

-- перевод в режим посещаемости сохраняет часы и людей
select ensure_attendance_mode((select id from trainings where canonical_id='T-0007'));
select pg_temp.ok(has_attendance((select id from trainings where canonical_id='T-0007')), 'M10 режим посещаемости включён');
select pg_temp.ok(man_hours((select id from trainings where canonical_id='T-0007')) = 800, 'R2 после перевода в режим посещаемости 800 человеко-часов');
select pg_temp.ok(participants_count((select id from trainings where canonical_id='T-0007')) = 50, 'R2 после перевода 50 участников');
select pg_temp.ok((select count(*) from session_attendance) = 50, 'R2 для каждого участника одна отметка (его заход)');
select pg_temp.ok(actual_total((select id from trainings where canonical_id='T-0007')) = 121085, 'R3 расход 121085 не изменился');

-- ====================== ПОСЕЩАЕМОСТЬ ======================
create temp table _p as select tp.id pid, tp.session_id sid from training_participants tp order by tp.id limit 2;
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e',
  format('select set_attendance(%L::jsonb, %L)', (select jsonb_agg(jsonb_build_object('participant_id',pid,'session_id',sid,'status','ABSENT'))::text from _p where pid=(select pid from _p limit 1)), ''))$$,
  'A1 посещаемость без причины запрещена', 'P0012');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e',
  format('select set_attendance(%L::jsonb, %L)', (select jsonb_agg(jsonb_build_object('participant_id',pid,'session_id',sid,'status','ABSENT'))::text from _p where pid=(select pid from _p limit 1)), 'Не пришёл'));
select pg_temp.ok(man_hours((select id from trainings where canonical_id='T-0007')) = 784, 'A2 отсутствие на заходе: 800 - 16 = 784');
select pg_temp.ok(participants_count((select id from trainings where canonical_id='T-0007')) = 49, 'A2 участник без единого посещения не считается: 49');
select pg_temp.ok((select reason from audit_log where table_name='session_attendance' order by id desc limit 1) = 'Не пришёл', 'A3 причина попала в audit_log');
select pg_temp.ok((select user_id from audit_log where table_name='session_attendance' order by id desc limit 1) = '00000000-0000-0000-0000-00000000000e', 'A3 в аудите автор — менеджер');
select pg_temp.ok(actual_total((select id from trainings where canonical_id='T-0007')) = 121085, 'A4 сумма расходов не изменилась от смены посещаемости');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', format('select set_attendance(%L::jsonb, %L)', '[]', 'x'))$$, 'A5 VIEWER не отмечает посещаемость', '42501');

-- откат отметки
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e',
  format('select revert_change(%s, %L)', (select id from audit_log where table_name='session_attendance' and action in ('UPDATE','INSERT') and new_row->>'status'='ABSENT' order by id desc limit 1), 'Ошибка отметки'));
select pg_temp.ok(man_hours((select id from trainings where canonical_id='T-0007')) = 800, 'V1 откат возвращает 800 человеко-часов');
select pg_temp.ok((select reason from audit_log where table_name='session_attendance' order by id desc limit 1) like 'Откат изменения #%: Ошибка отметки', 'V1 откат записан в аудит с причиной');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e',
  format('select revert_change(%s, %L)', (select id from audit_log where table_name='session_attendance' and new_row->>'status'='ABSENT' order by id desc limit 1), 'Повтор'))$$,
  'V2 повторный откат того же изменения запрещён (поле изменилось позже)', 'P0014');

-- ====================== СОЗДАНИЕ ТРЕНИНГА / РОЛИ ======================
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', $q$select create_training('{"title":"X","start_date":"2026-05-01","hours":8}'::jsonb)$q$)$$, 'C1 HR не создаёт тренинг', '42501');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', $q$select create_training('{"title":"X","start_date":"2026-05-01","hours":8}'::jsonb)$q$)$$, 'C1 VIEWER не создаёт тренинг', '42501');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select create_training('{"title":" ","start_date":"2026-05-01","hours":8}'::jsonb)$q$)$$, 'C2 пустое название', 'P0015');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select create_training('{"title":"X","start_date":"2026-05-10","end_date":"2026-05-01","hours":8}'::jsonb)$q$)$$, 'C2 окончание раньше начала', 'P0015');
create temp table _t(n int, id uuid);
insert into _t select 1, pg_temp.val_as('00000000-0000-0000-0000-00000000000e', $q$select create_training('{"title":"Лидерство","start_date":"2026-05-01","end_date":"2026-05-02","hours":16,"format":"OFFLINE","kind":"INTERNAL"}'::jsonb)$q$)::uuid;
insert into _t select 2, pg_temp.val_as('00000000-0000-0000-0000-00000000000e', $q$select create_training('{"title":"Excel","start_date":"2026-06-01","hours":8}'::jsonb)$q$)::uuid;
select pg_temp.ok((select canonical_id from trainings where id=(select id from _t where n=1)) = 'TR-2026-001', 'C3 код TR-2026-001');
select pg_temp.ok((select canonical_id from trainings where id=(select id from _t where n=2)) = 'TR-2026-002', 'C3 следующий код TR-2026-002');
select pg_temp.ok((select source_type from trainings where id=(select id from _t where n=1)) = 'UNPLANNED', 'C4 без заявки тренинг внеплановый');
select pg_temp.ok((select created_by from trainings where id=(select id from _t where n=1)) = '00000000-0000-0000-0000-00000000000e', 'C5 автор создания записан');
select pg_temp.ok(exists(select 1 from audit_log where table_name='trainings' and action='INSERT' and user_id='00000000-0000-0000-0000-00000000000e'), 'C5 создание в аудите');

-- ====================== РЕДАКТИРОВАНИЕ ======================
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select update_training(%L, '{"status":"COMPLETED"}'::jsonb, null)$q$)$$, (select id from _t where n=1)),
  'U1 смена статуса без причины запрещена', 'P0012');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select update_training(%L, '{"status":"IN_PROGRESS"}'::jsonb, 'Начали')$q$, (select id from _t where n=1)));
select pg_temp.ok((select status from trainings where id=(select id from _t where n=1)) = 'IN_PROGRESS', 'U2 статус изменён');
select pg_temp.ok((select reason from audit_log where table_name='trainings' and action='UPDATE' order by id desc limit 1) = 'Начали', 'U2 причина смены статуса в аудите');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select update_training(%L, '{"location":"Худжанд"}'::jsonb)$q$, (select id from _t where n=1)));
select pg_temp.ok((select location from trainings where id=(select id from _t where n=1)) = 'Худжанд', 'U3 несущественное поле меняется без причины');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select update_training(%L, '{"canonical_id":"HACK"}'::jsonb, 'x')$q$)$$, (select id from _t where n=1)), 'U4 служебное поле нельзя менять', 'P0015');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', $q$select update_training(%L, '{"title":"Z"}'::jsonb)$q$)$$, (select id from _t where n=1)), 'U5 HR не правит тренинг', '42501');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select update_training(%L, '{"hours":99}'::jsonb, 'x')$q$)$$, (select id from trainings where canonical_id='T-0007')),
  'U6 часы тренинга с заходами нельзя править вручную', 'P0013');
-- прямая запись VIEWER запрещена RLS
select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', $q$update trainings set title='ХАК' where canonical_id='T-0007'$q$);
select pg_temp.ok((select title from trainings where canonical_id='T-0007') = 'Системное мышление', 'U7 RLS: VIEWER не меняет тренинг напрямую');

-- ====================== ЗАЯВКИ ======================
create temp table _r(n int, id uuid);
insert into _r select 1, pg_temp.val_as('00000000-0000-0000-0000-00000000000e', $q$select create_request('{"plan_year":2026,"topic":"Excel для финансистов","participants_planned":20,"budget_amount":12000,"budget_currency":"USD"}'::jsonb)$q$)::uuid;
select pg_temp.ok((select budget_currency from training_requests where id=(select id from _r where n=1)) = 'TJS', 'Q1 новая заявка всегда в TJS (USD игнорируется)');
select pg_temp.ok((select canonical_id from training_requests where id=(select id from _r where n=1)) = 'REQ-2026-001', 'Q1 код заявки REQ-2026-001');
insert into training_requests(canonical_id,plan_year,topic,budget_amount,budget_currency,status) values ('REQ-OLD',2025,'Старая',1000,'USD','APPROVED');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select update_request((select id from training_requests where canonical_id='REQ-OLD'), '{"budget_amount":1500}'::jsonb, 'Уточнили бюджет')$q$);
select pg_temp.ok((select budget_currency from training_requests where canonical_id='REQ-OLD') = 'USD' and (select budget_amount from training_requests where canonical_id='REQ-OLD')=1500, 'Q2 историческая USD остаётся USD (сумма изменена, валюта нет)');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select update_request((select id from training_requests where canonical_id='REQ-OLD'), '{"status":"DONE"}'::jsonb, null)$q$)$$, 'Q3 смена статуса заявки без причины', 'P0012');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', $q$select create_request('{"plan_year":2026,"topic":"x"}'::jsonb)$q$)$$, 'Q4 HR не создаёт заявки', '42501');

-- привязка заявки
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select link_request(%L, %L, null, false, 'Связь')$q$)$$, (select id from _t where n=1), (select id from _r where n=1)),
  'L1 внеплановый + заявка без подтверждения запрещено', 'P0002');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select link_request(%L, %L, 'PLANNED', false, null)$q$)$$, (select id from _t where n=1), (select id from _r where n=1)),
  'L2 привязка без причины запрещена', 'P0012');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select link_request(%L, %L, 'PLANNED', false, 'Заявка подтверждена')$q$, (select id from _t where n=1), (select id from _r where n=1)));
select pg_temp.ok((select request_id from trainings where id=(select id from _t where n=1)) = (select id from _r where n=1) and (select source_type from trainings where id=(select id from _t where n=1))='PLANNED', 'L3 привязка заявки и тип PLANNED');
select pg_temp.ok((select reason from audit_log where table_name='trainings' order by id desc limit 1) = 'Заявка подтверждена', 'L3 причина привязки в аудите');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select link_request(%L, null, null, false, 'Отвязали')$q$, (select id from _t where n=1)));
select pg_temp.ok((select request_id from trainings where id=(select id from _t where n=1)) is null and (select source_type from trainings where id=(select id from _t where n=1))='UNPLANNED', 'L4 отвязка заявки переводит в UNPLANNED');
-- откат отвязки (UNPLANNED + заявка: нужно подтверждение внутри revert)
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select revert_change(%s, 'Отвязали зря')$q$, (select id from audit_log where table_name='trainings' and action='UPDATE' order by id desc limit 1)));
select pg_temp.ok((select request_id from trainings where id=(select id from _t where n=1)) is not null, 'V3 откат отвязки заявки возвращает связь');

-- ====================== ЗАХОДЫ И УЧАСТНИКИ ======================
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select upsert_session(%L, null, '{"start_date":"2026-05-01","end_date":"2026-05-01","hours":8}'::jsonb)$q$, (select id from _t where n=1)));
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select upsert_session(%L, null, '{"start_date":"2026-05-02","end_date":"2026-05-02","hours":8}'::jsonb)$q$, (select id from _t where n=1)));
select pg_temp.ok((select hours from trainings where id=(select id from _t where n=1)) = 16, 'S1 часы тренинга = сумма заходов (16)');
select pg_temp.ok((select session_no from training_sessions where training_id=(select id from _t where n=1) order by session_no desc limit 1) = 2, 'S1 номера заходов растут');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select upsert_session(%L, %L, '{"hours":4}'::jsonb, null)$q$)$$, (select id from _t where n=1), (select id from training_sessions where training_id=(select id from _t where n=1) and session_no=2)),
  'S2 смена часов захода без причины', 'P0012');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select add_participants(%L, array(select id from employees order by canonical_id limit 10), null)$q$, (select id from _t where n=1)));
select pg_temp.ok(participants_count((select id from _t where n=1)) = 10, 'P1 добавлено 10 участников');
select pg_temp.ok((select count(*) from session_attendance a join training_participants p on p.id=a.participant_id where p.training_id=(select id from _t where n=1)) = 20, 'P1 по умолчанию «присутствовал» на всех заходах (10 x 2)');
select pg_temp.ok(man_hours((select id from _t where n=1)) = 160, 'P2 человеко-часы 10 x 16 = 160');
-- повторное добавление не создаёт дублей
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select add_participants(%L, array(select id from employees order by canonical_id limit 12), null)$q$, (select id from _t where n=1)));
select pg_temp.ok(participants_count((select id from _t where n=1)) = 12, 'P3 повторное добавление: только новые (12 всего)');
-- по подразделению
select pg_temp.ok((select add_participants_by_unit((select id from _t where n=2), (select id from org_units where name='Финансовый департамент'), null)) = 60, 'P4 добавить по департаменту: 60 активных сотрудников');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', format('select add_participants(%L, array[]::uuid[], null)', gen_random_uuid()))$$, 'P5 VIEWER не добавляет участников', '42501');
-- HR может добавлять и убирать участников
select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', format($q$select add_participants(%L, array(select id from employees order by canonical_id desc limit 3), 'HR добавил')$q$, (select id from _t where n=1)));
select pg_temp.ok(participants_count((select id from _t where n=1)) = 15, 'P6 HR добавляет участников');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', $q$select remove_participant((select id from training_participants where training_id=%L limit 1), null)$q$)$$, (select id from _t where n=1)), 'P7 удаление участника без причины', 'P0012');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', format($q$select remove_participant((select id from training_participants where training_id=%L order by id limit 1), 'Ошибочно добавлен')$q$, (select id from _t where n=1)));
select pg_temp.ok(participants_count((select id from _t where n=1)) = 14, 'P7 участник удалён');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', format($q$select revert_change(%s, 'Вернуть')$q$, (select id from audit_log where table_name='training_participants' and action='DELETE' order by id desc limit 1)));
select pg_temp.ok(participants_count((select id from _t where n=1)) = 15, 'V4 откат удаления участника возвращает его');
-- новый заход в режиме посещаемости: присутствуют все
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select upsert_session(%L, null, '{"start_date":"2026-05-03","end_date":"2026-05-03","hours":4}'::jsonb)$q$, (select id from _t where n=1)));
select pg_temp.ok(man_hours((select id from _t where n=1)) = 15 * 20, 'S3 новый заход (4 ч) добавил 15 x 4 человеко-часов: 300');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select delete_session(%L, null)$q$)$$, (select id from training_sessions where training_id=(select id from _t where n=1) and session_no=3)), 'S4 удаление захода без причины', 'P0012');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select delete_session(%L, 'Заход отменён')$q$, (select id from training_sessions where training_id=(select id from _t where n=1) and session_no=3)));
select pg_temp.ok((select hours from trainings where id=(select id from _t where n=1)) = 16 and man_hours((select id from _t where n=1)) = 240, 'S4 после удаления захода часы вернулись: 16 и 240');
-- архив
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select set_training_archived(%L, true, null)$q$)$$, (select id from _t where n=2)), 'AR1 архив без причины', 'P0012');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select set_training_archived(%L, true, 'Дубликат')$q$, (select id from _t where n=2)));
select pg_temp.ok((select archived_at from trainings where id=(select id from _t where n=2)) is not null, 'AR2 тренинг в архиве');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select add_participants(%L, array(select id from employees limit 1), null)$q$)$$, (select id from _t where n=2)), 'AR3 в архивный тренинг участников не добавить', 'P0005');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select update_training(%L, '{"title":"Q"}'::jsonb)$q$)$$, (select id from _t where n=2)), 'AR3 архивный тренинг не редактируется', 'P0005');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select set_training_archived(%L, false, 'Вернули')$q$, (select id from _t where n=2)));
select pg_temp.ok((select archived_at from trainings where id=(select id from _t where n=2)) is null, 'AR4 восстановление из архива');

-- ====================== РАСХОДЫ ======================
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select add_expense(%L, (select id from expense_categories where code='RENT'), 1000, 'TJS', '2026-05-01', 'аренда', null)$q$)$$, (select id from _t where n=1)), 'X1 расход без причины', 'P0012');
create temp table _x(n int, id uuid);
insert into _x select 1, pg_temp.val_as('00000000-0000-0000-0000-00000000000e', format($q$select add_expense(%L, (select id from expense_categories where code='RENT'), 1000, 'TJS', '2026-05-01', 'аренда', 'Счёт №5')$q$, (select id from _t where n=1)))::uuid;
insert into _x select 2, pg_temp.val_as('00000000-0000-0000-0000-00000000000f', format($q$select add_expense(%L, (select id from expense_categories where code='FEE'), 200, 'USD', '2026-03-15', 'гонорар', 'Договор')$q$, (select id from _t where n=1)))::uuid;
select pg_temp.ok((select amount_tjs from expense_operations where id=(select id from _x where n=1)) = 1000, 'X2 TJS: курс 1, сумма 1000');
select pg_temp.ok((select amount_tjs from expense_operations where id=(select id from _x where n=2)) = 2200 and (select fx_rate from expense_operations where id=(select id from _x where n=2)) = 11, 'X2 USD по реальному курсу 11: 2200 TJS');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select add_expense(%L, (select id from expense_categories where code='RENT'), 5, 'EUR', '2026-05-01', null, 'нет курса')$q$)$$, (select id from _t where n=1)), 'X3 валюта без курса — ошибка, не курс 1', 'P0001');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', $q$select add_expense(%L, (select id from expense_categories where code='RENT'), 5, 'TJS', '2026-05-01', null, 'hr')$q$)$$, (select id from _t where n=1)), 'X4 HR не создаёт расходы', '42501');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', $q$select add_expense(%L, (select id from expense_categories where code='RENT'), 5, 'TJS', '2026-05-01', null, 'v')$q$)$$, (select id from _t where n=1)), 'X4 VIEWER не создаёт расходы', '42501');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select update_expense(%L, '{"amount":1500}'::jsonb, 'Уточнили сумму')$q$, (select id from _x where n=1)));
select pg_temp.ok((select amount_tjs from expense_operations where id=(select id from _x where n=1)) = 1500, 'X5 менеджер правит сумму, amount_tjs пересчитан');
select pg_temp.ok((select reason from audit_log where table_name='expense_operations' and action='UPDATE' order by id desc limit 1) = 'Уточнили сумму', 'X5 причина правки суммы в аудите');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select update_expense(%L, '{"amount":1}'::jsonb, null)$q$)$$, (select id from _x where n=1)), 'X6 правка суммы без причины', 'P0012');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select void_expense(%L, 'x')$q$)$$, (select id from _x where n=1)), 'X7 сторно менеджеру недоступно', '42501');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000f', format($q$select void_expense(%L, 'Ошибка ввода')$q$, (select id from _x where n=2)));
select pg_temp.ok(actual_total((select id from _t where n=1)) = 1500, 'X8 после сторно факт = 1500');
-- суммы не пересчитываются от числа участников
select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', format($q$select add_participants(%L, array(select id from employees order by canonical_id desc limit 30), null)$q$, (select id from _t where n=1)));
select pg_temp.ok(actual_total((select id from _t where n=1)) = 1500, 'X9 изменение числа участников не меняет суммы расходов');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c', format('select actual_total(%L)::text', (select id from _t where n=1))) is null, 'X10 HR: финансы NULL (ограничено)');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'select 1 from expense_operations') = 0, 'X10 HR не видит расходов (RLS)');

-- ====================== АУДИТ ======================
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000e', 'select 1 from audit_log') = 0, 'AU1 менеджер напрямую аудит не читает');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000e', format('select 1 from entity_audit(%L, %L)', 'trainings', (select id from _t where n=1))) > 5, 'AU2 менеджер читает историю тренинга через entity_audit');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000c', format($$select 1 from entity_audit('trainings', %L) where table_name='expense_operations'$$, (select id from _t where n=1))) = 0, 'AU3 HR не видит в истории тренинга денежные операции');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000e', format($$select 1 from entity_audit('trainings', %L) where table_name='expense_operations'$$, (select id from _t where n=1))) > 0, 'AU3 менеджер видит денежные операции');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000a', 'select 1 from audit_log') > 0, 'AU4 ADMIN читает аудит напрямую');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000a', 'update audit_log set reason=''x''')$$, 'AU5 аудит неизменяем даже для ADMIN', 'permission denied');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select revert_change(%s, 'x')$q$)$$, (select id from audit_log where table_name='expense_operations' order by id desc limit 1)), 'AU6 расходы откатом не отменить (только сторно)', 'P0015');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', format('select revert_change(%s, %L)', (select id from audit_log where table_name='trainings' order by id desc limit 1), 'x'))$$, 'AU7 VIEWER не откатывает', '42501');

-- ====================== СОТРУДНИКИ ======================
create temp table _e(id uuid);
insert into _e select pg_temp.val_as('00000000-0000-0000-0000-00000000000c', $q$select create_employee('{"full_name":"Иванов Пётр","position":"Юрист"}'::jsonb)$q$)::uuid;
select pg_temp.ok((select canonical_id from employees where id=(select id from _e)) like 'EMP-%' and (select name_norm from employees where id=(select id from _e))='иванов петр', 'E1 сотрудник создан, ФИО нормализовано (ё→е)');
select pg_temp.ok(norm_name('  Иванов,  Пётр ') = 'иванов петр', 'E1 norm_name убирает знаки и пробелы');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', format($q$select add_employee_alias(%L, 'Иванов П.', 'Подтверждено кадрами')$q$, (select id from _e)));
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', $q$select add_employee_alias((select id from employees where canonical_id='E-0001'), 'иванов п', 'дубль')$q$)$$), 'E2 то же написание второму сотруднику не закрепить', 'P0015');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', $q$select update_employee(%L, '{"is_active":false}'::jsonb, null)$q$)$$, (select id from _e)), 'E3 деактивация сотрудника требует причину', 'P0012');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', $q$select create_employee('{"full_name":"Хак"}'::jsonb)$q$)$$, 'E4 VIEWER не создаёт сотрудников', '42501');
select pg_temp.ok(not exists(select 1 from employees e join training_participants p on p.employee_id=e.id where e.canonical_id like 'EMP-%'), 'E5 сотрудники из участников автоматически не создаются');

-- ====================== DATA QUALITY ======================
create temp table _q(n int, a int, b int, c int);
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', 'select dq_scan()')$$, 'D0 HR не запускает сканер', '42501');
insert into _q select 1, pg_temp.val_as('00000000-0000-0000-0000-00000000000e', 'select opened from dq_scan()')::int, null, null;
select pg_temp.ok((select a from _q where n=1) > 0, 'D1 сканер нашёл проблемы');
-- проведённый тренинг без участников
insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type)
values ('T-NOP','Без людей','ONLINE','INTERNAL',4,'2026-01-10','2026-01-10','COMPLETED','UNPLANNED');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select dq_scan()$q$);
select pg_temp.ok(exists(select 1 from dq_issues where rule_code='TRAINING_NO_PARTICIPANTS' and entity_id=(select id::text from trainings where canonical_id='T-NOP') and status='OPEN'), 'D2 правило «нет участников»');
select pg_temp.ok((select details->>'training_id' from dq_issues where rule_code='TRAINING_NO_PARTICIPANTS' and entity_id=(select id::text from trainings where canonical_id='T-NOP')) = (select id::text from trainings where canonical_id='T-NOP'), 'D2 в details есть ссылка на сущность (кнопка «Открыть»)');
select pg_temp.ok(exists(select 1 from dq_issues where rule_code='SRC_CANDIDATE_UNCONFIRMED' or rule_code='REQUEST_NO_TRAINING' or rule_code='TRAINING_PLANNED_IN_PAST' or rule_code='PARTICIPANTS_PLAN_VS_FACT' or rule_code='TRAINING_NO_PARTICIPANTS'), 'D3 правила записывают проблемы');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000c', 'select 1 from dq_issues') > 0, 'D4 HR читает Data Quality');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', 'select dq_resolve(%s, ''IN_REVIEW'', null)')$$, (select id from dq_issues limit 1)), 'D4 HR не решает проблемы', '42501');
select pg_temp.expect_error(format($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', 'select dq_resolve(%s, ''IGNORE'', null)')$$, (select id from dq_issues where rule_code='TRAINING_NO_PARTICIPANTS' limit 1)), 'D5 игнорирование без причины', 'P0012');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select dq_resolve(%s, 'IN_REVIEW', null)$q$, (select id from dq_issues where rule_code='TRAINING_NO_PARTICIPANTS' limit 1)));
select pg_temp.ok((select status from dq_issues where rule_code='TRAINING_NO_PARTICIPANTS' limit 1) = 'IN_REVIEW', 'D6 «оставить на проверке»');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select dq_scan()$q$);
select pg_temp.ok((select status from dq_issues where rule_code='TRAINING_NO_PARTICIPANTS' and entity_id=(select id::text from trainings where canonical_id='T-NOP')) = 'IN_REVIEW', 'D7 повторный скан не затирает решение человека');
-- исправили в интерфейсе (добавили участников) → скан закрывает проблему
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format($q$select add_participants(%L, array(select id from employees limit 2), 'Добавили')$q$, (select id from trainings where canonical_id='T-NOP')));
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select dq_scan()$q$);
select pg_temp.ok((select status from dq_issues where rule_code='TRAINING_NO_PARTICIPANTS' and entity_id=(select id::text from trainings where canonical_id='T-NOP')) = 'FIXED', 'D8 исправление данных автоматически закрывает проблему');
-- игнор с причиной и аудит
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select update_training((select id from trainings where canonical_id='T-NOP'), '{"status":"PLANNED"}'::jsonb, 'Вернули в план')$q$);
select pg_temp.ok(not exists(select 1 from dq_issues where rule_code='TRAINING_DONE_IN_FUTURE' and status='OPEN' and entity_id=(select id::text from trainings where canonical_id='T-NOP')), 'D9 нет ложных срабатываний');

-- повторный скан без изменений не создаёт лишних записей аудита
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select dq_scan()$q$);
create temp table _a(n int);
insert into _a select count(*) from audit_log where table_name='dq_issues';
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', $q$select dq_scan()$q$);
select pg_temp.ok((select count(*) from audit_log where table_name='dq_issues') = (select n from _a), 'D10 повторный скан без изменений не пишет в аудит');

-- ====================== ИТОГ РЕГРЕССИИ ======================
select pg_temp.ok(participants_count((select id from trainings where canonical_id='T-0007')) = 50
              and man_hours((select id from trainings where canonical_id='T-0007')) = 800
              and actual_total((select id from trainings where canonical_id='T-0007')) = 121085, 'R9 в конце: #7+#8 = 50 участников, 800 человеко-часов, 121085 расхода');

do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
