-- Тесты Фазы 1 (переносимые: работают и локально, и в Supabase).
-- Весь прогон заканчивается намеренной ошибкой RESULT, поэтому ничего не сохраняется (откат).
-- Результаты пишутся во временную таблицу и выводятся в сообщении RESULT.

create temp table res(n serial, name text, ok boolean, detail text);

create or replace function pg_temp.ok(p_cond boolean, p_name text) returns void language plpgsql as $$
begin
  insert into res(name, ok) values (p_name, p_cond is true);
end $$;

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

-- ---------- Данные (только внутри теста) ----------
insert into expense_categories(code,name,group_code,is_trainer_fee) values
  ('RENT','Аренда помещения','ORG',false),('COFFEE','Кофе-брейк','ORG',false),
  ('LUNCH','Обед','ORG',false),('FEE','Гонорар тренера','TRAINER',true),('OTHER','Доп. расходы','ORG',false);

insert into org_units(name, level) values ('Финансовый департамент','DEPARTMENT');
insert into org_units(parent_id, name, level) select id,'Отдел внутреннего контроля','UNIT' from org_units limit 1;

insert into employees(canonical_id, full_name, name_norm, department_id, unit_id, position)
select 'E-'||lpad(g::text,4,'0'), 'Сотрудник '||g, 'сотрудник '||g,
       (select id from org_units where level='DEPARTMENT'), (select id from org_units where level='UNIT'), 'Специалист'
from generate_series(1,60) g;

insert into budget_versions(name,fiscal_year,status,approved_at) values
  ('Бюджет 2026',2026,'APPROVED','2025-12-30'),
  ('Оптимизация',2026,'CANCELLED',null);
insert into budget_lines(version_id,topic,amount_usd,quarter) values
  ((select id from budget_versions where status='APPROVED'),'Тема А',1000,1),
  ((select id from budget_versions where status='APPROVED'),'Тема Б',500,2),
  ((select id from budget_versions where status='CANCELLED'),'Тема В',99999,4);

insert into trainings(canonical_id,legacy_reestr_id,title,format,kind,hours,start_date,end_date,status,source_type)
values ('T-0007',7,'Системное мышление','OFFLINE','EXTERNAL',32,'2025-07-13','2025-07-26','COMPLETED','UNPLANNED');
insert into training_sessions(training_id,session_no,start_date,end_date,hours,legacy_reestr_id) values
  ((select id from trainings where canonical_id='T-0007'),1,'2025-07-13','2025-07-16',16,8),
  ((select id from trainings where canonical_id='T-0007'),2,'2025-07-23','2025-07-26',16,7);
insert into training_participants(training_id,session_id,employee_id,department_snapshot,unit_snapshot,position_snapshot)
select (select id from trainings where canonical_id='T-0007'),
       (select id from training_sessions where session_no = case when rn<=26 then 1 else 2 end),
       id, 'Финансовый департамент','Отдел внутреннего контроля','Специалист'
from (select id, row_number() over (order by canonical_id) rn from employees) e where rn<=50;
insert into expense_operations(training_id,category_id,amount,operation_date)
values ((select id from trainings where canonical_id='T-0007'),(select id from expense_categories where code='FEE'),57128,'2025-07-26'),
       ((select id from trainings where canonical_id='T-0007'),(select id from expense_categories where code='OTHER'),63957,'2025-07-26');

-- ---------- T1. Тренинги 7+8 ----------
select pg_temp.ok(participants_count((select id from trainings where canonical_id='T-0007')) = 50, 'T1 50 участников');
select pg_temp.ok(actual_total((select id from trainings where canonical_id='T-0007')) = 121085, 'T1 расход 121085 один раз');
select pg_temp.ok(cost_per_participant((select id from trainings where canonical_id='T-0007')) = 2421.70, 'T1 на одного 2421,70');
select pg_temp.ok(man_hours((select id from trainings where canonical_id='T-0007')) = 800, 'T1 человеко-часы 800 (50 x 16)');
select pg_temp.expect_error($$insert into training_participants(training_id,employee_id) select training_id, employee_id from training_participants limit 1$$, 'T1b дубль участника запрещён', 'duplicate');

-- ---------- T2. Курс ----------
select pg_temp.expect_error($$insert into expense_operations(training_id,category_id,amount,currency,operation_date)
  values ((select id from trainings limit 1),1,100,'USD','2026-03-01')$$, 'T2 нет курса = ошибка, а не курс 1', 'Нет курса');
insert into fx_rates values ('2026-02-20','USD',10.90,'тест'),('2026-03-10','USD',11.00,'тест');
insert into expense_operations(training_id,category_id,amount,currency,operation_date)
  values ((select id from trainings limit 1),(select id from expense_categories where code='RENT'),100,'USD','2026-03-01');
select pg_temp.ok((select amount_tjs from expense_operations where currency='USD') = 1090.00
              and (select fx_date from expense_operations where currency='USD') = '2026-02-20',
              'T2 курс на дату операции (20.02, не 10.03 и не сегодняшний)');

-- ---------- T3. План ----------
select pg_temp.ok(planned_total_usd(approved_version(2026::smallint)) = 1500, 'T3 план = только утверждённая версия (1500, отменённая 99999 не учтена)');
select pg_temp.expect_error($$select planned_total_tjs(approved_version(2026::smallint))$$, 'T3 нет бюджетного курса = ошибка', 'бюджетный курс');
update app_settings set value='11' where key='budget_fx_usd_tjs';
select pg_temp.ok(planned_total_tjs(approved_version(2026::smallint)) = 16500, 'T3 план в сомони 1500 x 11');
select pg_temp.expect_error($$insert into budget_versions(name,fiscal_year,status) values ('Дубль',2026,'APPROVED')$$, 'T3 вторая утверждённая версия года запрещена', 'unique');

-- ---------- T4. Плановые/внеплановые ----------
insert into training_requests(canonical_id,plan_year,topic) values ('REQ-1',2026,'Excel');
insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type,request_id)
values ('T-0100','Excel','OFFLINE','INTERNAL',18,'2026-03-26','2026-04-20','COMPLETED','PLANNED',(select id from training_requests where canonical_id='REQ-1'));
insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type)
values ('T-0101','Форум','OFFLINE','EXTERNAL',8,'2026-02-14','2026-02-14','COMPLETED','UNPLANNED');
select pg_temp.ok((select unplanned_training_count from unplanned_stats(2026::smallint)) = 1, 'T4 внеплановых 1');
select pg_temp.ok((select unplanned_percentage from unplanned_stats(2026::smallint)) = 50.00, 'T4 доля внеплановых 50%');
select pg_temp.ok((select unplanned_actual_cost from unplanned_stats(2026::smallint)) = 0, 'T4 стоимость внеплановых без расходов = 0');

-- ---------- T5. Защита PLANNED/UNPLANNED ----------
select pg_temp.expect_error($$update trainings set request_id=(select id from training_requests limit 1) where canonical_id='T-0101'$$, 'T5 UNPLANNED + заявка требует подтверждения', 'подтверждени');
do $$ begin
  begin
    set local app.confirmed = 'yes';
    update trainings set request_id=(select id from training_requests limit 1) where canonical_id='T-0101';
    insert into res(name, ok) values ('T5 с подтверждением привязка разрешена', true);
    raise exception 'rollback_sub';
  exception when raise_exception then
    if sqlerrm <> 'rollback_sub' then
      insert into res(name, ok, detail) values ('T5 с подтверждением привязка разрешена', false, sqlerrm);
    end if;
  end;
end $$;
insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type)
values ('T-0102','Плановый без заявки','OFFLINE','INTERNAL',8,'2026-05-01','2026-05-01','COMPLETED','PLANNED');
select pg_temp.ok((select count(*) from v_dq_source_logic where rule_code='SRC_PLANNED_NO_REQUEST') = 1, 'T5 WARNING: плановое без заявки');
select pg_temp.ok(not exists(select 1 from v_dq_source_logic where entity_id=(select id::text from trainings where canonical_id='T-0101')), 'T5 внеплановое без заявки не ошибка');

-- ---------- T6. Перенос заявки ----------
insert into training_requests(canonical_id,plan_year,topic,carry_forward,original_request_id,original_year,planned_year,status)
values ('REQ-2',2027,'Перенос',true,(select id from training_requests where canonical_id='REQ-1'),2026,2027,'CARRIED_FORWARD');
select pg_temp.ok((select carry_forward from training_requests where canonical_id='REQ-2'), 'T6 перенос 2026→2027 хранится, не UNPLANNED');

-- ---------- T7. Ограничения ----------
select pg_temp.expect_error($$insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type)
  values ('X','x','ONLINE','INTERNAL',8,'2026-05-02','2026-05-01','COMPLETED','UNPLANNED')$$, 'T7 окончание раньше начала', 'trainings_dates_ok');
select pg_temp.expect_error($$insert into training_requests(canonical_id,plan_year,topic,budget_amount) values ('REQ-3',2026,'t',59800)$$, 'T7 бюджет без валюты запрещён', 'req_budget_has_currency');

-- ---------- T8. Досье сотрудника ----------
select pg_temp.ok((select count(*) from employee_dossier((select id from employees where canonical_id='E-0001'))) = 1, 'T8 досье: одно участие');
select pg_temp.ok((select year from employee_dossier((select id from employees where canonical_id='E-0001'))) = 2025, 'T8 досье: год 2025');
select pg_temp.ok((select department_at_time from employee_dossier((select id from employees where canonical_id='E-0001'))) = 'Финансовый департамент', 'T8 досье: департамент на момент участия');

-- ---------- T9. Аудит ----------
select pg_temp.ok((select count(*) from audit_log where table_name='trainings' and action='INSERT') >= 4, 'T9 аудит фиксирует вставки');

-- ---------- T10. RLS ----------
-- Профили создаются БЕЗ строк в auth.users: на время вставки отключаем проверку внешних ключей (только внутри этого отката).
set local session_replication_role = replica;
insert into profiles(id,full_name,role) values
  ('00000000-0000-0000-0000-00000000000a','Админ','ADMIN'),
  ('00000000-0000-0000-0000-00000000000b','Финансист','FINANCE'),
  ('00000000-0000-0000-0000-00000000000c','Кадровик','HR'),
  ('00000000-0000-0000-0000-00000000000d','Наблюдатель','VIEWER');
set local session_replication_role = origin;
insert into employee_contacts(employee_id, phone) select id,'+992000000000' from employees limit 1;

create or replace function pg_temp.as_user(p_uid text, p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute 'select count(*) from ('||p_sql||') q' into n;
  reset role;
  return n;
end $$;

select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000c','select * from expense_operations') = 0, 'T10 HR не видит расходы');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000b','select * from expense_operations') > 0, 'T10 FINANCE видит расходы');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000d','select * from employee_contacts') = 0, 'T10 VIEWER не видит телефоны');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000c','select * from employee_contacts') = 1, 'T10 HR видит телефоны');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000d','select * from audit_log') = 0, 'T10 VIEWER не видит аудит');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000a','select * from audit_log') > 0, 'T10 ADMIN видит аудит');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000d','select * from trainings') > 0, 'T10 VIEWER видит тренинги');

create or replace function pg_temp.write_as(p_uid text, p_sql text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  set local role authenticated;
  execute p_sql;
  reset role;
end $$;
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000d',
  'insert into trainings(canonical_id,title,format,kind,hours,start_date,end_date,status,source_type) values (''V'',''v'',''ONLINE'',''INTERNAL'',1,''2026-01-01'',''2026-01-01'',''PLANNED'',''UNPLANNED'')')$$,
  'T10 VIEWER не может создать тренинг');
select pg_temp.expect_error($$select pg_temp.write_as('00000000-0000-0000-0000-00000000000b',
  'insert into expense_operations(training_id,category_id,amount,operation_date,amount_tjs) values ((select id from trainings limit 1),1,1,''2026-01-01'',999999)')$$,
  'T10 клиент не может сам записать amount_tjs');
select pg_temp.write_as('00000000-0000-0000-0000-00000000000b',
  'insert into expense_operations(training_id,category_id,amount,operation_date) values ((select id from trainings limit 1),(select id from expense_categories where code=''LUNCH''),10,''2026-01-01'')');
select pg_temp.ok(exists(select 1 from expense_operations where amount=10 and amount_tjs=10), 'T10 FINANCE может добавить расход, amount_tjs посчитала БД');

-- ---------- T11. Анонимный доступ закрыт, представление работает с правами читающего ----------
select pg_temp.ok(not has_table_privilege('anon','public.employees','select'), 'T11 anon не читает таблицы');
select pg_temp.ok(not has_table_privilege('anon','public.audit_log','select'), 'T11 anon не читает аудит');
select pg_temp.ok(not has_table_privilege('anon','public.v_dq_source_logic','select'), 'T11 anon не читает представление');
select pg_temp.ok(not has_function_privilege('anon','public.app_role()','execute'), 'T11 anon не вызывает app_role()');
select pg_temp.ok(not has_function_privilege('anon','public.trg_audit()','execute'), 'T11 anon не вызывает trg_audit()');
select pg_temp.ok(has_function_privilege('authenticated','public.app_role()','execute'), 'T11 authenticated вызывает app_role() (нужно для RLS)');
select pg_temp.ok(not has_function_privilege('authenticated','public.trg_audit()','execute'), 'T11 authenticated не вызывает trg_audit()');
select pg_temp.ok((select coalesce((reloptions @> array['security_invoker=true']),false) from pg_class where oid='public.v_dq_source_logic'::regclass), 'T11 представление security_invoker');
select pg_temp.ok(not exists(select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind in ('f','p')
    and not exists (select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
    and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%')), 'T11 у всех функций задан search_path');
select pg_temp.ok(pg_temp.as_user('00000000-0000-0000-0000-00000000000d','select * from v_dq_source_logic') >= 0, 'T11 VIEWER читает представление под своими правами');

-- ---------- Итог: всегда ошибка, чтобы откатить ВСЁ ----------
do $$
declare total int; passed int; fails text;
begin
  select count(*), count(*) filter (where ok) into total, passed from res;
  select coalesce(string_agg(n||'. '||name||coalesce(' ['||detail||']',''), E'\n'),'нет') into fails from res where not ok;
  raise exception 'RESULT % / % passed. Failures: %', passed, total, fails;
end $$;
