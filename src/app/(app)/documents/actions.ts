"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ERR } from "@/lib/workflows/errors";
import { WF_ROLES } from "@/lib/workflows/roles";
import { fieldErrorsFrom } from "@/lib/workflows/schemas";
import { archiveDocumentSchema, documentIdSchema, registerDocumentSchema } from "@/lib/documents/schemas";
import { canDoc, SIGNED_URL_TTL_SECONDS, BUCKET } from "@/lib/documents/rules";
import type { Json } from "@/types/database";

type Scope = Record<string, string | undefined>;

function refresh(scope?: Scope) {
  if (scope?.employeeId) revalidatePath(`/employees/${scope.employeeId}`);
  if (scope?.trainingId) revalidatePath(`/trainings/${scope.trainingId}`);
  if (scope?.requestId) revalidatePath(`/trainings/requests/${scope.requestId}`);
  if (scope?.examId) revalidatePath(`/exams/${scope.examId}`);
  if (scope?.agreementId) revalidatePath(`/funding/${scope.agreementId}`);
  if (scope?.certificateId) revalidatePath(`/exams`);
}

/**
 * Шаг 1 из 3: запись документа PENDING и путь в Storage. Файл браузер загружает сам, под сессией пользователя
 * (RLS бакета разрешает только путь, зарегистрированный автором), затем вызывает confirmDocument.
 */
export async function registerDocument(input: unknown): Promise<Result<{ id: string; path: string }>> {
  const actor = await requireRole(WF_ROLES.document);
  if (!actor.ok) return actor;
  const parsed = registerDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  if (!canDoc(actor.role, v.doc_type, true)) return fail("Ваша роль не может загружать документы этого типа.");
  const p = {
    doc_type: v.doc_type,
    title: v.title,
    file_name: v.file_name,
    mime_type: v.mime_type,
    size_bytes: v.size_bytes,
    expires_on: v.expires_on ?? null,
    note: v.note,
    employee_id: v.scope.employeeId ?? null,
    training_id: v.scope.trainingId ?? null,
    exam_id: v.scope.examId ?? null,
    request_id: v.scope.requestId ?? null,
    agreement_id: v.scope.agreementId ?? null,
    certificate_id: v.scope.certificateId ?? null,
  };
  const res = await callRpc("register_document", { p: p as unknown as Json });
  if (!res.ok) return res;
  const out = res.data as { id?: unknown; path?: unknown } | null;
  if (!out || typeof out.id !== "string" || typeof out.path !== "string") return fail(WF_ERR.generic);
  return { ok: true, data: { id: out.id, path: out.path } };
}

/** Шаг 3 из 3: БД проверяет, что объект появился в Storage, и переводит документ в UPLOADED. */
export async function confirmDocument(input: { id: string; scope?: Scope }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.document);
  if (!actor.ok) return actor;
  const parsed = documentIdSchema.safeParse(input);
  if (!parsed.success) return fail(WF_ERR.notFound);
  const res = await callRpc("confirm_document", { p_id: parsed.data.id });
  if (!res.ok) return res;
  refresh(input.scope);
  return { ok: true, message: "Документ загружен.", data: undefined };
}

export async function archiveDocument(input: { id: string; archived: boolean; reason: string; scope?: Scope }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.document);
  if (!actor.ok) return actor;
  const parsed = archiveDocumentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(parsed.error));
  const res = await callRpc("archive_document", { p_id: parsed.data.id, p_archived: parsed.data.archived, p_reason: parsed.data.reason });
  if (!res.ok) return res;
  refresh(input.scope);
  return { ok: true, message: parsed.data.archived ? "Документ перенесён в архив. Файл сохранён." : "Документ возвращён из архива.", data: undefined };
}

/**
 * Подписанная ссылка на просмотр или скачивание. Создаётся под сессией пользователя: Storage RLS пропустит файл,
 * только если пользователь видит строку документа. Срок жизни — 60 секунд; публичных ссылок нет.
 */
export async function createDocumentSignedUrl(input: { id: string; download?: boolean }): Promise<Result<{ url: string; expiresIn: number }>> {
  const actor = await requireRole(WF_ROLES.document);
  if (!actor.ok) return actor;
  const parsed = documentIdSchema.safeParse(input);
  if (!parsed.success) return fail(WF_ERR.notFound);
  try {
    const supabase = await createClient();
    const { data: doc } = await supabase.from("documents").select("id, doc_type, status, storage_path, file_name").eq("id", parsed.data.id).maybeSingle();
    if (!doc || !canDoc(actor.role, doc.doc_type, false)) return fail(WF_ERR.notFound);
    if (doc.status !== "UPLOADED") return fail("Файл ещё не загружен.");
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, input.download ? { download: doc.file_name } : undefined);
    if (error || !data?.signedUrl) return fail("Не удалось получить ссылку на файл. Попробуйте ещё раз.");
    return { ok: true, data: { url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS } };
  } catch {
    return fail(WF_ERR.unavailable);
  }
}
