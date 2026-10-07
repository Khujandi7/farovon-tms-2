import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/lib/auth/roles";
import { ErrorState } from "@/components/common/states";
import { DocumentsList, type DocumentRow } from "@/components/documents/documents-list";
import { SCOPE_COLUMNS, canDoc, scopeIsEmpty, visibleDocTypes, writableDocTypes, type DocScope, type DocType } from "@/lib/documents/rules";

/**
 * Документы сущности (сотрудник, обучение, экзамен, заявка, соглашение, сертификат).
 * Фильтр по scope — по ВСЕМ указанным ключам; загрузка связывает документ со всеми ними.
 * Финансовые типы (договор, счёт, акт, платёжный документ, соглашение) видят только ADMIN, ACADEMY_MANAGER, FINANCE; VIEWER файлов не видит.
 * Просмотр и скачивание — только по подписанной ссылке (60 с); публичных ссылок нет.
 */
export async function DocumentsPanel({ role, scope, title = "Документы", docTypes }: { role: AppRole; scope: DocScope; title?: string; docTypes?: readonly DocType[] }) {
  const readable = visibleDocTypes(role, docTypes);
  const uploadTypes = writableDocTypes(role, docTypes);
  if (readable.length === 0 || scopeIsEmpty(scope)) return <DocumentsList docs={[]} scope={scope} uploadTypes={[]} title={title} restricted />;

  const supabase = await createClient();
  let req = supabase
    .from("documents")
    .select("id, doc_type, title, file_name, size_bytes, status, uploaded_at, expires_on, archived_at, archive_reason, note")
    .in("doc_type", readable)
    .order("uploaded_at", { ascending: false })
    .limit(200);
  for (const key of Object.keys(SCOPE_COLUMNS) as (keyof DocScope)[]) {
    const v = scope[key];
    if (v) req = req.eq(SCOPE_COLUMNS[key], v);
  }
  const { data, error } = await req;
  if (error) return <ErrorState className="bg-card" title="Не удалось загрузить документы" description="Попробуйте обновить страницу." />;

  const docs: DocumentRow[] = (data ?? []).map((d) => ({ ...d, canWrite: canDoc(role, d.doc_type, true) }));
  return <DocumentsList docs={docs} scope={scope} uploadTypes={uploadTypes} title={title} restricted={false} />;
}
