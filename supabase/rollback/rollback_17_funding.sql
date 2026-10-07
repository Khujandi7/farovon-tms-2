-- Откат M17: финансирование обучения (политики, соглашения, погашения). Данные удаляются безвозвратно.
drop table if exists agreement_repayments, learning_agreements, funding_policy_outcomes, funding_policies cascade;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array['next_agreement_code','trg_policy_guard','trg_policy_outcome_guard','trg_agreement_prepare','trg_repayment_guard','trg_repayment_status','upsert_funding_policy','confirm_funding_policy','create_agreement','update_agreement','cancel_agreement','evaluate_agreement','review_obligation','record_repayment','void_repayment']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
