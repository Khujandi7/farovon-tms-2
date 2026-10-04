-- Phase 1.5 · M7: приватность обратной связи. Личность респондента отделена от ответов.
-- Недеструктивная часть. Удаление устаревших столбцов feedback_responses вынесено в M8
-- (канал применения Supabase MCP зависает на DROP COLUMN; M8 выполняется вручную / через CLI).

create table feedback_respondents (
  response_id uuid primary key references feedback_responses(id) on delete cascade,
  employee_id uuid references employees(id),
  respondent_raw text not null,
  dedupe_key text not null unique,
  match_confidence numeric(5,2),
  match_status text not null default 'REVIEW' check (match_status in ('AUTO','REVIEW','CONFIRMED','REJECTED'))
);
create index feedback_respondents_employee_idx on feedback_respondents (employee_id);
alter table feedback_respondents enable row level security;   -- политик нет: прямой доступ закрыт всем
revoke all on feedback_respondents from authenticated, anon;  -- доступ только через reveal_respondent()

-- Сырые отзывы и комментарии: только ADMIN и ACADEMY_MANAGER.
-- Политики SELECT сужаются через ALTER POLICY (а не DROP POLICY): канал применения миграций
-- (Supabase MCP) зависает на отдельных командах DROP. Результат тот же; ручная очистка дублей
-- политик (DROP POLICY в SQL Editor) возможна позже и является чисто косметической.
alter policy feedback_responses_read on feedback_responses
  using (app_role() = any (array['ADMIN','ACADEMY_MANAGER']::app_role[]));
alter policy feedback_answers_read on feedback_answers
  using (app_role() = any (array['ADMIN','ACADEMY_MANAGER']::app_role[]));

insert into app_settings(key, value, description) values
  ('feedback_min_group', '5', 'Минимум ответов для показа агрегата ролям без права видеть личность респондента');

-- Агрегаты без личности и без комментариев; малая группа скрывается от HR/FINANCE/VIEWER
create function feedback_summary(p_feedback_training uuid)
returns table(block feedback_block, question_no smallint, answers integer, avg_score numeric)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  n int;
  k int := coalesce((select value::int from app_settings where key = 'feedback_min_group'), 5);
begin
  if app_role() is null then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  select count(*) into n from feedback_responses r
   where r.feedback_training_id = p_feedback_training and not r.is_archive;
  if n < k and not (app_role() = any (array['ADMIN','ACADEMY_MANAGER']::app_role[])) then
    return;
  end if;
  return query
    select a.block, a.question_no, count(*)::int, round(avg(a.score), 2)
    from feedback_answers a join feedback_responses r on r.id = a.response_id
    where r.feedback_training_id = p_feedback_training and not r.is_archive
    group by a.block, a.question_no
    order by a.block, a.question_no;
end $$;

-- Контролируемое раскрытие личности: роль, причина, запись в аудит
create function reveal_respondent(p_response uuid, p_reason text)
returns table(employee_id uuid, respondent_raw text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(app_role() = any (array['ADMIN','ACADEMY_MANAGER']::app_role[]), false) then
    raise exception 'Нет доступа' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Укажите причину раскрытия (не короче 10 символов)';
  end if;
  insert into audit_log(user_id, table_name, row_id, action, new_row)
  values (auth.uid(), 'feedback_respondents', p_response::text, 'REVEAL',
          jsonb_build_object('reason', p_reason));
  return query
    select r.employee_id, r.respondent_raw from feedback_respondents r where r.response_id = p_response;
end $$;

revoke execute on function feedback_summary(uuid), reveal_respondent(uuid, text) from public, anon;
grant  execute on function feedback_summary(uuid), reveal_respondent(uuid, text) to authenticated;
