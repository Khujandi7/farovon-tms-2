-- Phase 3 · M12: Data Quality — действенные проблемы (actionable): детали, отпечаток, решение, сканер правил.

alter table dq_issues drop constraint if exists dq_issues_status_check;
alter table dq_issues add constraint dq_issues_status_check
  check (status in ('OPEN','IN_REVIEW','CONFIRMED_OK','FIXED','IGNORED'));

alter table dq_issues
  add column source text not null default 'RULE' check (source in ('RULE','IMPORT')),
  add column details jsonb,
  add column fingerprint text,
  add column resolved_by uuid references profiles(id),
  add column resolved_at timestamptz,
  add column resolution text,
  add column updated_at timestamptz not null default now();
create unique index dq_issues_fingerprint_uq on dq_issues (fingerprint) where fingerprint is not null;
create index dq_issues_status_idx on dq_issues (status, severity);
create index dq_issues_entity_idx on dq_issues (entity_table, entity_id);
create index dq_issues_resolved_by_idx on dq_issues (resolved_by);

create trigger audit_dq_issues after insert or update or delete on dq_issues
  for each row execute function trg_audit();

-- ---------- Общие проверки ----------
create function req_reason(p_reason text) returns text language plpgsql immutable
set search_path = public, pg_temp as $$
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Укажите причину изменения' using errcode = 'P0012';
  end if;
  return trim(p_reason);
end $$;

create function req_role(p_roles app_role[]) returns app_role language plpgsql stable
set search_path = public, pg_temp as $$
declare r app_role := app_role();
begin
  if r is null or not (r = any (p_roles)) then
    raise exception 'Недостаточно прав для этого действия' using errcode = '42501';
  end if;
  return r;
end $$;

revoke execute on function req_reason(text), req_role(app_role[]) from public, anon;
grant  execute on function req_reason(text), req_role(app_role[]) to authenticated;

-- ---------- Сканер правил ----------
-- Находит текущие проблемы, добавляет новые, переоткрывает вернувшиеся (FIXED), автоматически закрывает исчезнувшие.
-- Решения человека (IGNORED / CONFIRMED_OK / IN_REVIEW) не затираются.
create function dq_scan() returns table(opened integer, auto_fixed integer, total_open integer)
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
         'Тренинг «' || t.title || '» всё ещё в статусе PLANNED, хотя дата окончания ' || t.end_date || ' прошла.',
         'Укажите фактический статус: проведён, отменён, перенесён или не состоялся.',
         jsonb_build_object('training_id', t.id, 'end_date', t.end_date, 'status', t.status)
    from trainings t
   where t.archived_at is null and t.status = 'PLANNED' and t.end_date < current_date;

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

-- Решение человека: оставить на проверке / подтвердить как есть / игнорировать / переоткрыть
create function dq_resolve(p_issue bigint, p_action text, p_reason text default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare v_status text;
begin
  perform req_role('{ADMIN,ACADEMY_MANAGER}'::app_role[]);
  v_status := case p_action when 'IN_REVIEW' then 'IN_REVIEW' when 'CONFIRM_OK' then 'CONFIRMED_OK'
                            when 'IGNORE' then 'IGNORED' when 'REOPEN' then 'OPEN' end;
  if v_status is null then raise exception 'Неизвестное действие: %', p_action; end if;
  if p_action in ('CONFIRM_OK','IGNORE') then perform req_reason(p_reason); end if;
  perform set_config('app.change_reason', coalesce(p_reason, ''), true);
  update dq_issues
     set status = v_status, updated_at = now(),
         resolved_by = case when v_status = 'OPEN' then null else auth.uid() end,
         resolved_at = case when v_status = 'OPEN' then null else now() end,
         resolution  = case when v_status = 'OPEN' then null else nullif(trim(coalesce(p_reason, '')), '') end
   where id = p_issue and status <> 'FIXED';
  if not found then raise exception 'Проблема не найдена или уже исправлена'; end if;
end $$;

revoke execute on function dq_scan(), dq_resolve(bigint, text, text) from public, anon;
grant  execute on function dq_scan(), dq_resolve(bigint, text, text) to authenticated;
