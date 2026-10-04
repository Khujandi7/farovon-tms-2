-- Phase 1.5 · M8: удаление устаревших столбцов личности из feedback_responses (после M7).
-- ДЕСТРУКТИВНАЯ миграция: выполняется вручную в SQL Editor Supabase или через `supabase db push`
-- (инструмент Supabase MCP зависает на DROP COLUMN). Защита: останавливается, если есть данные.

do $$ begin
  if exists (select 1 from feedback_responses) then
    raise exception 'В feedback_responses уже есть данные: нужен перенос в feedback_respondents, а не DROP COLUMN';
  end if;
end $$;

alter table feedback_responses
  drop column employee_id, drop column respondent_raw, drop column dedupe_key,
  drop column match_confidence, drop column match_status;
