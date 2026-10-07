-- Откат M16: досье (навыки, документы, сертификаты, экзамены, цели). Данные и метаданные документов удаляются; файлы в Storage остаются.
do $$ begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists tms_documents_read on storage.objects';
    execute 'drop policy if exists tms_documents_insert on storage.objects';
  end if;
end $$;
drop view if exists v_certificates;
drop table if exists development_goals, exam_costs, exams, certificates, documents, employee_skills, skills cascade;
do $$ declare r record; begin
  for r in select p.oid::regprocedure as sig from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array['certificate_status','trg_exam_cost_fx','trg_touch_actor','trg_exam_sync','trg_immutable','next_exam_code','doc_is_financial','can_doc','upsert_skill','add_employee_skill','create_exam','update_exam','set_exam_result','set_exam_cost','create_certificate','update_certificate','revoke_certificate','upsert_goal','register_document','confirm_document','archive_document','trg_documents_guard']) loop
    execute 'drop function ' || r.sig;
  end loop; end $$;
