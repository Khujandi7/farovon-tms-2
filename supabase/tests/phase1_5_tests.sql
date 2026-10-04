-- Тесты Phase 1.5 (переносимые: локально и в Supabase). Без DELETE (его проверяет phase1_5_local_only_tests.sql).
-- Заканчивается намеренной ошибкой RESULT, поэтому ничего не сохраняется.

create temp table res(n serial, name text, ok boolean, detail text);

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin insert into res(name, ok) values (p_name, p_cond is true); end $$;

create or replace function pg_temp.expect_error(p_sql text, p_name text, p_like text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_like is not null and sqlerrm not like '%'||p_like||'%' then
      insert into res(name, ok, detail) values (p_name, false, 'другая ошибка: '||sqlerrm);
    else
      insert into res(name, ok) values (p_name, true);
    end if;
    return;
  end;
  insert into res(name, ok, detail) values (p_name, false, 'ожидалась ошибка, её не было');
end $$;

-- число строк под пользователем
create or replace function pg_temp.as_user(p_uid text, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute 'select count(*) from ('||p_sql||') q' into n;
  reset role;
  return n;
end $$;
-- скалярное значение (текст) под пользователем
create or replace function pg_temp.val_as(p_uid text, p_sql text) returns text language plpgsql as $$
declare v text;
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql into v;
  reset role;
  return v;
end $$;
-- выполнить команду под пользователем
create or replace function pg_temp.write_as(p_uid text, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;

-- ---------- Данные ----------
insert into expense_categories(code,name,group_code,is_trainer_fee) values
  ('FEE','Гонорар','TRAINER',true),('OTHER','Доп. расходы','ORG',false);
insert into employees(canonical_id, full_name, name_norm)
  select 'E-'||g, 'Сотрудник '||g, 'сотрудник '||g from generate_series(1,8) g;

-- Профили без строк в auth.users: проверку FK откладываем до конца транзакции (она завершается откатом, FK не проверяется)
alter table profiles alter constraint profiles_id_fkey deferrable initially deferred;
insert into profiles(id,full_name,role,is_active) values
  ('00000000-0000-0000-0000-00000000000a','Админ','ADMIN',true),
  ('00000000-0000-0000-0000-00000000000b','Финансист','FINANCE',true),
  ('00000000-0000-0000-0000-00000000000c','Кадровик','HR',true),
  ('00000000-0000-0000-0000-00000000000d','Наблюдатель','VIEWER',true),
  ('00000000-0000-0000-0000-00000000000e','Менеджер академии','ACADEMY_MANAGER',true),
  ('00000000-0000-0000-0000-000000000001','Уволенный финансист','FINANCE',false),
  ('00000000-0000-0000-0000-000000000002','Второй админ','ADMIN',true);
-- uid 'f' = пользователь без профиля (в таблице profiles его нет)

-- ====================== M1: Auth, аудит, защита ADMIN ======================
insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type)
values ('T-0001','Основной','OFFLINE','INTERNAL',8,'2024-03-01','2024-03-01','COMPLETED','PLANNED');

select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-000000000001','select * from trainings') = 0, 'M1 деактивированный пользователь не видит данных');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000f','select * from trainings') = 0, 'M1 пользователь без профиля не видит данных');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000d','select * from trainings') = 1, 'M1 активный VIEWER видит тренинги');

insert into fx_rates values ('2026-01-01','USD',10.5,'тест');
update app_settings set value='11' where key='budget_fx_usd_tjs';
update profiles set full_name='Админ 1' where id='00000000-0000-0000-0000-00000000000a';
select pg_temp.ok(exists(select 1 from audit_log where table_name='fx_rates' and row_id='2026-01-01:USD' and action='INSERT'), 'M1 аудит: fx_rates (row_id дата:валюта)');
select pg_temp.ok(exists(select 1 from audit_log where table_name='app_settings' and row_id='budget_fx_usd_tjs' and action='UPDATE'), 'M1 аудит: app_settings (row_id = key)');
select pg_temp.ok(exists(select 1 from audit_log where table_name='profiles' and action='UPDATE'), 'M1 аудит: profiles');

-- второй админ есть: понизить одного можно
update profiles set role='VIEWER' where id='00000000-0000-0000-0000-000000000002';
select pg_temp.ok((select role from profiles where id='00000000-0000-0000-0000-000000000002')='VIEWER', 'M1 при двух ADMIN одного можно понизить');
select pg_temp.expect_error($$update profiles set role='VIEWER' where id='00000000-0000-0000-0000-00000000000a'$$, 'M1 последнего ADMIN нельзя понизить', 'последнего активного ADMIN');
select pg_temp.expect_error($$update profiles set is_active=false where id='00000000-0000-0000-0000-00000000000a'$$, 'M1 последнего ADMIN нельзя деактивировать', 'последнего активного ADMIN');
select pg_temp.expect_error($$select bootstrap_first_admin('x@example.com','X')$$, 'M1 bootstrap при существующем ADMIN отказывает', 'уже существует');
select pg_temp.ok(not has_function_privilege('authenticated','public.bootstrap_first_admin(text,text)','execute'), 'M1 authenticated не вызывает bootstrap_first_admin');
select pg_temp.ok(not has_function_privilege('anon','public.bootstrap_first_admin(text,text)','execute'), 'M1 anon не вызывает bootstrap_first_admin');
-- VIEWER пытается сменить себе роль: RLS не даёт обновить строку
select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', $$update profiles set role='ADMIN' where id='00000000-0000-0000-0000-00000000000d'$$);
select pg_temp.ok((select role from profiles where id='00000000-0000-0000-0000-00000000000d')='VIEWER', 'M1 VIEWER не может повысить себе роль');

-- ====================== M2: сторно расходов ======================
insert into expense_operations(training_id,category_id,amount,operation_date,comment) values
  ((select id from trainings where canonical_id='T-0001'),(select id from expense_categories where code='FEE'),1000,'2024-03-01','e1'),
  ((select id from trainings where canonical_id='T-0001'),(select id from expense_categories where code='OTHER'),500,'2024-03-01','e2');
select pg_temp.ok(actual_total((select id from trainings where canonical_id='T-0001')) = 1500, 'M2 до сторно факт 1500');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', format('select void_expense(%L,%L)', (select id from expense_operations where comment='e1'), 'ошибка'))$$, 'M2 HR не может сторнировать', 'Нет доступа');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', format('select void_expense(%L,%L)', (select id from expense_operations where comment='e1'), 'ошибка'))$$, 'M2 VIEWER не может сторнировать', 'Нет доступа');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000b', format('select void_expense(%L,%L)', (select id from expense_operations where comment='e1'), '  '))$$, 'M2 сторно без причины запрещено', 'причину');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000b', format('select void_expense(%L,%L)', (select id from expense_operations where comment='e1'), 'ошибочный ввод'));
select pg_temp.ok((select voided_at is not null and void_reason='ошибочный ввод' from expense_operations where comment='e1'), 'M2 FINANCE сторнирует: voided_at и причина записаны');
select pg_temp.ok(actual_total((select id from trainings where canonical_id='T-0001')) = 500, 'M2 сторно исключено из факта (1500 -> 500)');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000b', format('select void_expense(%L,%L)', (select id from expense_operations where comment='e1'), 'ещё раз'))$$, 'M2 повторное сторно запрещено', 'уже сторнирована');
select pg_temp.expect_error($$update expense_operations set amount=1 where comment='e1'$$, 'M2 сторнированная операция неизменяема', 'неизменяема');
select pg_temp.expect_error($$update expense_operations set voided_at=null where comment='e1'$$, 'M2 сторно необратимо', 'неизменяема');
select pg_temp.ok(not has_table_privilege('authenticated','public.expense_operations','delete'), 'M2 у authenticated нет DELETE на расходы');
select pg_temp.ok(not has_column_privilege('authenticated','public.expense_operations','voided_at','update'), 'M2 клиент не может писать voided_at');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000b', format('update expense_operations set voided_at=now() where id=%L', (select id from expense_operations where comment='e2')))$$, 'M2 прямое UPDATE voided_at клиентом запрещено', 'permission denied');

-- ====================== M3: архив тренингов ======================
insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type)
values ('T-EMPTY','Пустой','ONLINE','INTERNAL',4,'2024-04-01','2024-04-01','PLANNED','PLANNED');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format('select archive_training(%L,%L)', (select id from trainings where canonical_id='T-EMPTY'), ''))$$, 'M3 архивация без причины запрещена', 'причину');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format('select archive_training(%L,%L)', (select id from trainings where canonical_id='T-EMPTY'), 'создан по ошибке'));
select pg_temp.ok((select archived_at is not null and archive_reason='создан по ошибке' and archived_by is not null from trainings where canonical_id='T-EMPTY'), 'M3 тренинг без расходов архивируется (причина, кто, когда)');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000e', format('select archive_training(%L,%L)', (select id from trainings where canonical_id='T-0001'), 'x'))$$, 'M3 тренинг с расходами архивировать нельзя', 'есть расходы');
select pg_temp.expect_error($$insert into expense_operations(training_id,category_id,amount,operation_date) values ((select id from trainings where canonical_id='T-EMPTY'),(select id from expense_categories where code='FEE'),1,'2024-04-02')$$, 'M3 расход в архивный тренинг запрещён', 'в архиве');
select pg_temp.expect_error($$insert into training_participants(training_id,employee_id) values ((select id from trainings where canonical_id='T-EMPTY'),(select id from employees limit 1))$$, 'M3 участник в архивный тренинг запрещён', 'в архиве');
select pg_temp.expect_error($$insert into training_sessions(training_id,session_no,start_date,end_date,hours) values ((select id from trainings where canonical_id='T-EMPTY'),1,'2024-04-01','2024-04-01',4)$$, 'M3 сессия в архивный тренинг запрещена', 'в архиве');
select pg_temp.ok((select count(*) from pg_constraint where contype='f' and confdeltype='r'
   and conname in ('expense_operations_training_id_fkey','training_participants_training_id_fkey','training_sessions_training_id_fkey'))=3, 'M3 FK на расходы/участников/сессии = RESTRICT');
select pg_temp.ok((select confdeltype from pg_constraint where conname='training_trainers_training_id_fkey')='c', 'M3 связь training_trainers остаётся CASCADE');
select pg_temp.ok(exists(select 1 from pg_trigger where tgname='training_no_delete'), 'M3 триггер запрета удаления тренинга с фактами на месте');
-- исправление guard: статус подтверждённого UNPLANNED+заявка меняется без app.confirmed; смена заявки требует подтверждения
insert into training_requests(canonical_id,plan_year,topic) values ('REQ-A',2026,'А'),('REQ-B',2026,'Б');
select set_config('app.confirmed','yes',true);
insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type,request_id)
values ('T-UNPL','Внеплановый с заявкой','OFFLINE','EXTERNAL',8,'2024-05-01','2024-05-01','PLANNED','UNPLANNED',(select id from training_requests where canonical_id='REQ-A'));
select set_config('app.confirmed','no',true);
update trainings set status='COMPLETED' where canonical_id='T-UNPL';
select pg_temp.ok((select status from trainings where canonical_id='T-UNPL')='COMPLETED', 'M3 смена статуса UNPLANNED+заявка не требует подтверждения (баг исправлен)');
select pg_temp.expect_error($$update trainings set request_id=(select id from training_requests where canonical_id='REQ-B') where canonical_id='T-UNPL'$$, 'M3 смена заявки у UNPLANNED требует подтверждения', 'подтверждени');

-- ====================== Бюджет 2026 (нужен M4/M5/M6) ======================
update app_settings set value=null where key='budget_fx_usd_tjs';
insert into budget_versions(name,fiscal_year) values ('Бюджет 2026',2026);
insert into budget_lines(version_id,topic,amount_usd,quarter) values
  ((select id from budget_versions where name='Бюджет 2026'),'Тема А',1000,1),
  ((select id from budget_versions where name='Бюджет 2026'),'Тема Б',500,2);
insert into budget_line_items(budget_line_id,category_id,amount_usd)
  select id,(select id from expense_categories where code='FEE'),amount_usd from budget_lines;

-- ====================== M5: неизменяемость бюджета ======================
select pg_temp.expect_error($$insert into budget_versions(name,fiscal_year,status) values ('Сразу утверждён',2026,'APPROVED')$$, 'M5 нельзя создать версию сразу APPROVED', 'создаётся как DRAFT');
select pg_temp.expect_error($$update budget_versions set status='APPROVED' where name='Бюджет 2026'$$, 'M5 прямой UPDATE статуса DRAFT->APPROVED запрещён', 'только через approve');
select pg_temp.expect_error($$select approve_budget_version((select id from budget_versions where name='Бюджет 2026'))$$, 'M5 approve без бюджетного курса отказывает', 'бюджетный курс');
update app_settings set value='11' where key='budget_fx_usd_tjs';
insert into budget_versions(name,fiscal_year) values ('Пустая',2031);
select pg_temp.expect_error($$select approve_budget_version((select id from budget_versions where name='Пустая'))$$, 'M5 approve версии без строк отказывает', 'нет строк');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000b', format('select approve_budget_version(%L)', (select id from budget_versions where name='Бюджет 2026')));
select pg_temp.ok((select status::text||approved_by::text from budget_versions where name='Бюджет 2026')='APPROVED00000000-0000-0000-0000-00000000000b', 'M5 FINANCE утверждает версию (approved_by записан)');
select pg_temp.ok(approved_version(2026::smallint) = (select id from budget_versions where name='Бюджет 2026'), 'M5 approved_version() = утверждённая версия');
select pg_temp.expect_error($$update budget_versions set name='Переименована' where name='Бюджет 2026'$$, 'M5 APPROVED версию нельзя править', 'неизменяема');
select pg_temp.expect_error($$update budget_versions set note='x' where name='Бюджет 2026'$$, 'M5 примечание APPROVED версии неизменяемо', 'неизменяема');
select pg_temp.expect_error($$update budget_lines set amount_usd=1 where topic='Тема А'$$, 'M5 строку APPROVED версии нельзя менять', 'неизменяем');
select pg_temp.expect_error($$insert into budget_lines(version_id,topic,amount_usd) values ((select id from budget_versions where name='Бюджет 2026'),'Новая',1)$$, 'M5 в APPROVED версию нельзя добавить строку', 'утверждённой версии');
select pg_temp.expect_error($$update budget_line_items set amount_usd=1 where budget_line_id=(select id from budget_lines where topic='Тема А')$$, 'M5 статью APPROVED версии нельзя менять', 'неизменяем');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000b', format('update budget_versions set note=%L where name=%L','x','Бюджет 2026'))$$, 'M5 FINANCE тоже не может править APPROVED', 'неизменяема');
-- ревизия
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000c', format('select create_budget_revision(%L,%L)', (select id from budget_versions where name='Бюджет 2026'), 'повод'))$$, 'M5 HR не может создать ревизию');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d', format('select create_budget_revision(%L,%L)', (select id from budget_versions where name='Бюджет 2026'), 'повод'))$$, 'M5 VIEWER не может создать ревизию');
select pg_temp.expect_error($$select create_budget_revision((select id from budget_versions where name='Бюджет 2026'), ' ')$$, 'M5 ревизия без причины запрещена', 'причину');
select pg_temp.expect_error($$select create_budget_revision((select id from budget_versions where name='Пустая'), 'x')$$, 'M5 ревизия только от APPROVED', 'только от утверждённой');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000b', format('select create_budget_revision(%L,%L)', (select id from budget_versions where name='Бюджет 2026' and status='APPROVED'), 'корректировка плана'));
select pg_temp.ok((select revision_no=2 and status='DRAFT' and supersedes_version_id=(select id from budget_versions where name='Бюджет 2026' and status='APPROVED') and revision_reason='корректировка плана'
                   from budget_versions where revision_no=2), 'M5 ревизия: DRAFT, revision_no=2, ссылка на прежнюю, причина');
select pg_temp.ok((select count(*) from budget_lines where version_id=(select id from budget_versions where revision_no=2))=2
              and planned_total_usd((select id from budget_versions where revision_no=2))=1500
              and (select count(*) from budget_line_items i join budget_lines l on l.id=i.budget_line_id where l.version_id=(select id from budget_versions where revision_no=2))=2, 'M5 ревизия копирует строки и статьи (1500 USD)');
select pg_temp.expect_error($$select create_budget_revision((select id from budget_versions where name='Бюджет 2026' and status='APPROVED'), 'вторая')$$, 'M5 вторая открытая ревизия запрещена', 'budget_one_open_revision');
-- правим DRAFT-ревизию (разрешено) и утверждаем
update budget_lines set amount_usd=2000 where version_id=(select id from budget_versions where revision_no=2) and topic='Тема А';
select pg_temp.write_as('00000000-0000-0000-0000-00000000000b', format('select approve_budget_version(%L)', (select id from budget_versions where revision_no=2)));
select pg_temp.ok((select count(*) from budget_versions where fiscal_year=2026 and status='APPROVED')=1
              and (select status::text from budget_versions where revision_no=1 and fiscal_year=2026)='ARCHIVED'
              and approved_version(2026::smallint)=(select id from budget_versions where revision_no=2), 'M5 после approve ревизии: одна APPROVED, прежняя ARCHIVED');
select pg_temp.ok(planned_total_usd((select id from budget_versions where revision_no=1 and fiscal_year=2026))=1500
              and planned_total_usd(approved_version(2026::smallint))=2500, 'M5 история: старая версия 1500, действующая 2500');
select pg_temp.expect_error($$update budget_lines set amount_usd=1 where version_id=(select id from budget_versions where revision_no=1 and fiscal_year=2026)$$, 'M5 ARCHIVED версия неизменяема', 'неизменяем');
select pg_temp.expect_error($$update budget_versions set status='APPROVED' where revision_no=1 and fiscal_year=2026$$, 'M5 ARCHIVED нельзя вернуть в APPROVED', 'неизменяема');
select pg_temp.expect_error($$select set_config('app.budget_workflow','yes',true); insert into budget_versions(name,fiscal_year,status) values ('Дубль',2026,'APPROVED')$$, 'M5 индекс «одна APPROVED на год» страхует и при флаге', 'unique');

-- ====================== M4: финансовая видимость ======================
insert into training_participants(training_id,employee_id) select (select id from trainings where canonical_id='T-0001'), id from employees order by canonical_id limit 2;
insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type)
values ('T-NOEXP','Без расходов','ONLINE','INTERNAL',2,'2024-06-01','2024-06-01','COMPLETED','PLANNED');
select pg_temp.ok(actual_total((select id from trainings where canonical_id='T-0001'))=500 and cost_per_participant((select id from trainings where canonical_id='T-0001'))=250, 'M4 postgres/серверный контекст: GRANTED, 500 и 250 на человека');
select pg_temp.ok(financial_access_state()='GRANTED', 'M4 серверный контекст = GRANTED');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c',$$select actual_total((select id from trainings where canonical_id='T-0001'))::text$$) is null, 'M4 HR: actual_total = NULL, не 0');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c',$$select cost_per_participant((select id from trainings where canonical_id='T-0001'))::text$$) is null, 'M4 HR: cost_per_participant = NULL');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c',$$select planned_total_usd(approved_version(2026::smallint))::text$$) is null, 'M4 HR: план USD = NULL');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c',$$select variance_tjs(2026::smallint)::text$$) is null, 'M4 HR: отклонение = NULL');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c',$$select financial_access_state()::text$$)='FINANCIAL_DATA_RESTRICTED', 'M4 HR: состояние FINANCIAL_DATA_RESTRICTED');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c',$$select cost_share_tjs::text from employee_dossier((select employee_id from training_participants limit 1)) limit 1$$) is null
              and pg_temp.as_user('00000000-0000-0000-0000-00000000000c',$$select * from employee_dossier((select employee_id from training_participants limit 1))$$)=1, 'M4 HR: досье есть, стоимость NULL');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c',$$select financial_access::text||':'||coalesce(actual_tjs::text,'NULL') from v_training_financials where training_id=(select id from trainings where canonical_id='T-0001')$$)='FINANCIAL_DATA_RESTRICTED:NULL', 'M4 HR: v_training_financials = RESTRICTED + NULL');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000b',$$select financial_access::text||':'||actual_tjs::text||':'||cost_per_participant_tjs::text from v_training_financials where training_id=(select id from trainings where canonical_id='T-0001')$$)='GRANTED:500.00:250.00', 'M4 FINANCE: v_training_financials = GRANTED 500.00 / 250.00');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000b',$$select actual_tjs::text from v_training_financials where training_id=(select id from trainings where canonical_id='T-NOEXP')$$)='0', 'M4 FINANCE: тренинг без расходов = 0, а не NULL');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000f',$$select financial_access_state()::text$$)='FINANCIAL_DATA_RESTRICTED', 'M4 пользователь без профиля = RESTRICTED');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-000000000001',$$select financial_access_state()::text$$)='FINANCIAL_DATA_RESTRICTED', 'M4 неактивный пользователь = RESTRICTED');
do $$
declare u text; ok_ int; bad text := '';
begin
  foreach u in array array['a','b','c','d','e','f','1'] loop
    u := '00000000-0000-0000-0000-00000000000'||u;
    if (pg_temp.val_as(u,'select has_financial_access()::text') = 'true')
       is distinct from (pg_temp.as_user(u,'select * from expense_operations') > 0) then
      bad := bad || u || ' ';
    end if;
  end loop;
  insert into res(name, ok, detail) values ('M4 has_financial_access() согласован с RLS расходов для всех ролей', bad = '', nullif(bad,''));
end $$;

-- ====================== M6: KPI (год 2025: свой план и тренинги) ======================
insert into budget_versions(name,fiscal_year) values ('Бюджет 2025',2025);
insert into budget_lines(version_id,topic,amount_usd,quarter) values ((select id from budget_versions where name='Бюджет 2025'),'План 2025',1000,1);
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000b',$$select plan_status from kpi_year(2025::smallint)$$)='NO_APPROVED_VERSION', 'M6 нет утверждённой версии -> NO_APPROVED_VERSION, а не 0');
select approve_budget_version((select id from budget_versions where name='Бюджет 2025'));

insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type,source_confirmed) values
  ('K1','K1 плановый проведён','OFFLINE','INTERNAL',8,'2025-03-01','2025-03-01','COMPLETED','PLANNED',true),
  ('K2','K2 внеплановый проведён','OFFLINE','EXTERNAL',16,'2025-12-20','2025-12-21','COMPLETED','UNPLANNED',true),
  ('K3','K3 внеплановый отменён','OFFLINE','EXTERNAL',8,'2025-06-01','2025-06-01','CANCELLED','UNPLANNED',true),
  ('K4','K4 идёт','ONLINE','INTERNAL',8,'2025-09-01','2025-09-30','IN_PROGRESS','PLANNED',true),
  ('K5','K5 внеплановый кандидат','OFFLINE','INTERNAL',8,'2025-05-01','2025-05-01','COMPLETED','UNPLANNED',false),
  ('K6','K6 архивный','OFFLINE','INTERNAL',8,'2025-04-01','2025-04-01','COMPLETED','PLANNED',true);
insert into training_participants(training_id,employee_id)
  select t.id, e.id from (values ('K1','E-1'),('K1','E-2'),('K1','E-3'),('K2','E-2'),('K2','E-4'),('K5','E-5'),('K6','E-6')) v(t,e)
  join trainings t on t.canonical_id=v.t join employees e on e.canonical_id=v.e;
update training_participants set attended=false where training_id=(select id from trainings where canonical_id='K1') and employee_id=(select id from employees where canonical_id='E-3');
select archive_training((select id from trainings where canonical_id='K6'),'дубль записи');
insert into expense_operations(training_id,category_id,amount,operation_date,comment) values
  ((select id from trainings where canonical_id='K1'),(select id from expense_categories where code='FEE'),3000,'2025-03-05','k1'),
  ((select id from trainings where canonical_id='K1'),(select id from expense_categories where code='FEE'),9999,'2025-03-06','k1-void'),
  ((select id from trainings where canonical_id='K2'),(select id from expense_categories where code='FEE'),500,'2025-12-21','k2-2025'),
  ((select id from trainings where canonical_id='K2'),(select id from expense_categories where code='FEE'),2000,'2026-01-05','k2-2026'),
  ((select id from trainings where canonical_id='K3'),(select id from expense_categories where code='FEE'),700,'2025-06-02','k3');
update expense_operations set voided_at=now(), void_reason='тест' where comment='k1-void';

-- A = 3000 + 500 + 700 = 4200 (операция 2026 и сторно не входят; расход отменённого K3 входит)
select pg_temp.ok((select financial_actual_tjs from kpi_year(2025::smallint))=4200, 'M6 A: факт 2025 = 4200 (по operation_date; K3 отменён, но включён; сторно исключено)');
select pg_temp.ok((select financial_actual_tjs from kpi_year(2026::smallint))=2000, 'M6 A: расход от 05.01.2026 по тренингу 2025 попадает в 2026');
select pg_temp.ok((select delivered_count from kpi_year(2025::smallint))=3, 'M6 B: проведено 3 (K1,K2,K5); K3 отменён, K4 идёт, K6 архивный не входят');
select pg_temp.ok((select delivered_unique_participants from kpi_year(2025::smallint))=4, 'M6 B: уникальных участников 4 (E-1,E-2,E-4,E-5; E-3 не явился, E-2 в одном тренинге учтён раз)');
select pg_temp.ok((select delivered_man_hours from kpi_year(2025::smallint))=(2*8 + 2*16 + 1*8), 'M6 B: человеко-часы = 16 + 32 + 8 = 56');
select pg_temp.ok((select in_progress_count from kpi_year(2025::smallint))=1, 'M6 C: в процессе 1 (отдельно от B)');
select pg_temp.ok((select unplanned_delivered_count from kpi_year(2025::smallint))=2, 'M6 D: внеплановых проведённых 2 (K2,K5)');
select pg_temp.ok((select unplanned_delivered_pct from kpi_year(2025::smallint))=66.67, 'M6 D: доля внеплановых 2/3 = 66.67');
select pg_temp.ok((select unplanned_unconfirmed_count from kpi_year(2025::smallint))=1, 'M6 D: неподтверждённых кандидатов 1');
select pg_temp.ok((select unplanned_financial_actual_tjs from kpi_year(2025::smallint))=1200, 'M6 E: расходы UNPLANNED 2025 = 500 + 700 = 1200 (подмножество A)');
select pg_temp.ok((select plan_status='OK' and plan_usd=1000 and plan_tjs=11000 and variance_tjs=round(4200-11000,2) from kpi_year(2025::smallint)), 'M6 план 1000 USD = 11000 TJS, отклонение = A - план = -6800');
select pg_temp.ok((select plan_status from kpi_year(2030::smallint))='NO_APPROVED_VERSION' and (select plan_usd from kpi_year(2030::smallint)) is null, 'M6 год без плана: NO_APPROVED_VERSION, план NULL');
update app_settings set value=null where key='budget_fx_usd_tjs';
select pg_temp.ok((select plan_status from kpi_year(2025::smallint))='NO_FX' and (select plan_tjs from kpi_year(2025::smallint)) is null, 'M6 нет бюджетного курса: NO_FX, без падения');
update app_settings set value='11' where key='budget_fx_usd_tjs';
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c',$$select (financial_access::text||'|'||coalesce(financial_actual_tjs::text,'N')||'|'||coalesce(plan_usd::text,'N')||'|'||coalesce(unplanned_financial_actual_tjs::text,'N')||'|'||coalesce(variance_tjs::text,'N')||'|'||delivered_count) from kpi_year(2025::smallint)$$)='FINANCIAL_DATA_RESTRICTED|N|N|N|N|3', 'M6 HR: финансовые KPI NULL, нефинансовые (проведено=3) доступны');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000d',$$select financial_actual_tjs::text from kpi_year(2025::smallint)$$)='4200.00', 'M6 VIEWER видит те же числа (4200)');

-- ====================== M7: приватность обратной связи ======================
-- Если M8 ещё не применена (устаревшие NOT NULL столбцы на месте), подставляем значения по умолчанию внутри отката
do $$ begin
  if exists (select 1 from information_schema.columns where table_name='feedback_responses' and column_name='respondent_raw') then
    execute 'alter table feedback_responses alter column respondent_raw set default '''', alter column dedupe_key set default gen_random_uuid()::text';
  end if;
end $$;
insert into feedback_trainings(code,title,trainer_raw,event_date) values ('TR-1','Отзывы 5','Иванов','2025-03-01'),('TR-2','Отзывы 4','Петров','2025-04-01');
insert into feedback_responses(submitted_at,feedback_training_id,comment,is_archive)
  select '2025-03-02 10:00', (select id from feedback_trainings where code='TR-1'), 'комментарий '||g, false from generate_series(1,5) g;
insert into feedback_responses(submitted_at,feedback_training_id,comment,is_archive)
  select '2025-04-02 10:00', (select id from feedback_trainings where code='TR-2'), 'комментарий '||g, false from generate_series(1,4) g;
insert into feedback_responses(submitted_at,feedback_training_id,comment,is_archive)
  values ('2025-04-03 10:00', (select id from feedback_trainings where code='TR-2'), 'архив', true);
insert into feedback_respondents(response_id,respondent_raw,dedupe_key)
  select id, 'Респондент '||row_number() over (order by submitted_at, comment), 'k-'||id from feedback_responses;
insert into feedback_answers(response_id,block,question_no,score)
  select r.id,'MATERIALS',1,(array[5,4,4,5,3])[((row_number() over (partition by r.feedback_training_id order by r.comment)) - 1) % 5 + 1]
  from feedback_responses r where not r.is_archive;

select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000c','select * from feedback_responses')=0, 'M7 HR не читает сырые отзывы');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000b','select * from feedback_responses')=0, 'M7 FINANCE не читает сырые отзывы (и комментарии)');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000d','select * from feedback_answers')=0, 'M7 VIEWER не читает сырые ответы');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000e','select * from feedback_responses')=10, 'M7 ACADEMY_MANAGER читает сырые отзывы');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000a','select * from feedback_answers')=9, 'M7 ADMIN читает сырые ответы');
select pg_temp.ok(not has_table_privilege('authenticated','public.feedback_respondents','select') and not has_table_privilege('anon','public.feedback_respondents','select'), 'M7 личности респондентов закрыты для всех (кроме reveal)');
select pg_temp.expect_error($$select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','select * from feedback_respondents')$$, 'M7 даже ADMIN не читает feedback_respondents напрямую', 'permission denied');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000c',format('select * from feedback_summary(%L)',(select id from feedback_trainings where code='TR-1')))=1, 'M7 HR: агрегат при 5 ответах доступен');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000c',format('select answers||%L||avg_score from feedback_summary(%L)','|',(select id from feedback_trainings where code='TR-1')))='5|4.20', 'M7 агрегат: 5 ответов, среднее 4.20');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000c',format('select * from feedback_summary(%L)',(select id from feedback_trainings where code='TR-2')))=0, 'M7 HR: при 4 ответах (+1 архив) агрегат скрыт');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000d',format('select * from feedback_summary(%L)',(select id from feedback_trainings where code='TR-2')))=0, 'M7 VIEWER: при 4 ответах агрегат скрыт');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000e',format('select * from feedback_summary(%L)',(select id from feedback_trainings where code='TR-2')))=1, 'M7 ACADEMY_MANAGER видит агрегат и при малой группе');
select pg_temp.expect_error($$select pg_temp.as_user('00000000-0000-0000-0000-00000000000f', format('select * from feedback_summary(%L)',(select id from feedback_trainings where code='TR-1')))$$, 'M7 пользователь без профиля не получает агрегат', 'Нет доступа');
select pg_temp.ok(not has_function_privilege('anon','public.feedback_summary(uuid)','execute') and not has_function_privilege('anon','public.reveal_respondent(uuid,text)','execute'), 'M7 anon не вызывает feedback_summary / reveal_respondent');
select pg_temp.expect_error($$select pg_temp.as_user('00000000-0000-0000-0000-00000000000c', format('select * from reveal_respondent(%L,%L)',(select id from feedback_responses limit 1),'достаточно длинная причина'))$$, 'M7 HR не может раскрыть личность', 'Нет доступа');
select pg_temp.expect_error($$select pg_temp.as_user('00000000-0000-0000-0000-00000000000d', format('select * from reveal_respondent(%L,%L)',(select id from feedback_responses limit 1),'достаточно длинная причина'))$$, 'M7 VIEWER не может раскрыть личность', 'Нет доступа');
select pg_temp.expect_error($$select pg_temp.as_user('00000000-0000-0000-0000-00000000000a', format('select * from reveal_respondent(%L,%L)',(select id from feedback_responses limit 1),'коротко'))$$, 'M7 раскрытие без внятной причины запрещено', 'причину');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000a',format('select respondent_raw from reveal_respondent(%L,%L)',(select id from feedback_responses where comment='комментарий 1' limit 1),'разбор жалобы по обращению №17')) like 'Респондент %', 'M7 ADMIN раскрывает личность с причиной');
select pg_temp.ok(exists(select 1 from audit_log where action='REVEAL' and table_name='feedback_respondents' and new_row->>'reason'='разбор жалобы по обращению №17' and user_id='00000000-0000-0000-0000-00000000000a'), 'M7 раскрытие записано в audit_log с причиной и пользователем');
select pg_temp.ok(pg_temp.val_as('00000000-0000-0000-0000-00000000000e',format('select count(*)::text from reveal_respondent(%L,%L)',(select id from feedback_responses limit 1),'проверка корректности сопоставления')) = '1', 'M7 ACADEMY_MANAGER раскрывает личность с причиной');
select pg_temp.expect_error($$insert into feedback_respondents(response_id,respondent_raw,dedupe_key) select id,'дубль','k-'||id from feedback_responses limit 1$$, 'M7 PK feedback_respondents: один респондент на отзыв', 'duplicate');

-- ====================== Общие проверки схемы ======================
select pg_temp.ok(not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace
   and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
   and (has_function_privilege('anon', p.oid, 'execute'))), 'ALL ни одна функция public не доступна anon/PUBLIC');
select pg_temp.ok(not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind in ('f','p')
   and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
   and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')), 'ALL у всех функций задан search_path');
select pg_temp.ok(not exists(select 1 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' and not c.relrowsecurity), 'ALL RLS включён на всех таблицах');
select pg_temp.ok(not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'trg\_%'
   and has_function_privilege('authenticated', p.oid, 'execute')), 'ALL триггерные функции недоступны authenticated');
select pg_temp.ok(not exists(select 1 from pg_policies where schemaname='public' and tablename in ('feedback_responses','feedback_answers') and cmd in ('SELECT','ALL') and (qual like '%HR%' or qual like '%FINANCE%' or qual like '%VIEWER%')), 'ALL политики сырых отзывов не пускают HR/FINANCE/VIEWER');
select pg_temp.ok((select coalesce(reloptions @> array['security_invoker=true'],false) from pg_class where oid='public.v_training_financials'::regclass), 'ALL v_training_financials = security_invoker');
select pg_temp.ok(not has_table_privilege('anon','public.v_training_financials','select'), 'ALL anon не читает v_training_financials');

-- ---------- Итог ----------
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
