-- Откат M30: возвращает import_resolve_row к виду M1–M29 (решения только в STAGED) и удаляет новые функции.
-- Решения, уже сохранённые в строках, и сотрудники, созданные по ним, остаются (данные не откатываются).
drop function if exists import_apply_decided_batch(uuid, integer, integer, text);
drop function if exists import_decisions_summary(uuid);
drop function if exists import_resolve_rows_bulk(uuid, text, bigint[], integer);
create or replace function import_resolve_row(p_row bigint, p_decision text, p_match uuid default null) returns void
language plpgsql set search_path = public, pg_temp as $$
declare r import_job_rows%rowtype; j import_jobs%rowtype;
begin
  select * into r from import_job_rows where id = p_row;
  if not found then raise exception 'Строка не найдена' using errcode = 'P0015'; end if;
  select * into j from import_jobs where id = r.job_id;
  if not can_import(j.entity) then raise exception 'Недостаточно прав' using errcode = '42501'; end if;
  if j.status <> 'STAGED' then raise exception 'Импорт уже завершён' using errcode = 'P0015'; end if;
  if r.status <> 'NEEDS_REVIEW' then raise exception 'Строке не требуется решение' using errcode = 'P0015'; end if;
  if p_decision not in ('APPLY','SKIP','MATCH') then raise exception 'Неизвестное решение' using errcode = 'P0015'; end if;
  if p_decision = 'MATCH' and (p_match is null or not exists (select 1 from employees where id = p_match)) then
    raise exception 'Выберите сотрудника из справочника' using errcode = 'P0015'; end if;
  if p_decision = 'APPLY' and r.review_code in ('EMPLOYEE_NOT_FOUND','EMPLOYEE_AMBIGUOUS','EMPLOYEE_FUZZY') and j.entity <> 'EMPLOYEES' then
    raise exception 'Для сотрудника выберите «сопоставить» или «пропустить»: сотрудники из импорта списков не создаются' using errcode = 'P0015'; end if;
  update import_job_rows set decision = p_decision, decision_match = case when p_decision = 'MATCH' then p_match end, decided_by = auth.uid(), decided_at = now() where id = p_row;
  perform import_dq_sync(r.job_id, p_row, null, null, false);
end $$;
