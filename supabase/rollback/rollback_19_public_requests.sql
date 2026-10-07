-- Откат M19: публичные заявки и ссылки.
alter table training_requests drop column if exists submitted_via, drop column if exists request_link_id, drop column if exists contact;
drop table if exists public_request_attempts, request_links cascade;
delete from app_settings where key = 'public_request_open';
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array['create_request_link','set_request_link_active','regenerate_request_link','set_public_request_open','public_request_options','submit_public_request']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
