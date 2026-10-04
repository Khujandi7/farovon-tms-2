-- Откат M7. Только при пустых feedback_*; иначе данные респондентов будут потеряны.
do $$ begin
  if exists (select 1 from feedback_respondents) then
    raise exception 'Есть данные в feedback_respondents: сначала перенесите их обратно в feedback_responses';
  end if;
end $$;
drop function if exists feedback_summary(uuid);
drop function if exists reveal_respondent(uuid, text);
delete from app_settings where key = 'feedback_min_group';
drop table feedback_respondents;
alter policy feedback_responses_read on feedback_responses
  using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,HR,FINANCE,VIEWER}'::app_role[]));
alter policy feedback_answers_read on feedback_answers
  using (app_role() = any ('{ADMIN,ACADEMY_MANAGER,HR,FINANCE,VIEWER}'::app_role[]));
