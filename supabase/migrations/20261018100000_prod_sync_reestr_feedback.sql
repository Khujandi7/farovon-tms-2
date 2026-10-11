-- Sync of changes applied directly to Production during the Реестр / Бюджет / Заявки / ОС data load (2026-10-11/12).
-- Idempotent: safe to re-run.
alter table feedback_responses
  add column if not exists avg_materials numeric(4,2),
  add column if not exists avg_trainer numeric(4,2),
  add column if not exists avg_org numeric(4,2),
  add column if not exists avg_application numeric(4,2),
  add column if not exists final_score numeric(4,2),
  add column if not exists source text;

create or replace function public.norm_name_tg(p text) returns text
language sql immutable set search_path to 'public','pg_temp' as $f$
  select trim(regexp_replace(regexp_replace(regexp_replace(translate(public.norm_name(p),'ҷҳғқӯӣйъ','чхгкуии'),'дж','ч','g'),'хоча|ходжа|хуча|хожа','хоча','g'),'\s+',' ','g'))
$f$;

create or replace function public.merge_trainers(p_keep uuid, p_drop uuid) returns void
language plpgsql set search_path to 'public','pg_temp' as $f$
begin
  if p_keep = p_drop then raise exception 'Нельзя объединить тренера с самим собой'; end if;
  insert into trainer_aliases(trainer_id, alias_norm)
    select p_keep, public.norm_name(full_name) from trainers where id = p_drop
    on conflict (alias_norm) do nothing;
  update trainer_aliases set trainer_id = p_keep where trainer_id = p_drop;
  update training_trainers t set trainer_id = p_keep where t.trainer_id = p_drop
    and not exists (select 1 from training_trainers x where x.training_id = t.training_id and x.trainer_id = p_keep);
  delete from training_trainers where trainer_id = p_drop;
  delete from trainers where id = p_drop;
end $f$;

-- v_training_list must respect RLS of the caller
alter view if exists public.v_training_list set (security_invoker = true);
-- NOTE: reestr_participant_staging, trainer_aliases policies and expense-category seed
-- were also applied directly; verify with `supabase db diff` before the next release.
