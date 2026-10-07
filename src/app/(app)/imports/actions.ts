"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { reason, uuid } from "@/lib/workflows/schemas";
import { canImportEntity, IMPORT_ENTITIES } from "@/lib/imports/entities";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const refresh = (jobId?: string) => {
  revalidatePath("/imports");
  revalidatePath("/data-quality");
  if (jobId) revalidatePath(`/imports/${jobId}`);
};

const rowSchema = z.object({
  row_no: z.number().int().min(1).max(1_000_000),
  raw: z.record(z.string().max(100), z.string().max(2000)),
  data: z.record(z.string().max(40), z.string().max(2000)),
});

const stageSchema = z.object({
  entity: z.enum(IMPORT_ENTITIES),
  source: z.enum(["XLSX", "CSV", "PASTE", "GSHEET"]),
  fileName: z.string().trim().min(1).max(200),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/).nullish(),
  mapping: z.record(z.string().max(40), z.number().int().min(0).max(200).nullable()),
  trainingId: uuid.nullish(),
  rows: z.array(rowSchema).min(1, { message: "В файле нет строк" }).max(5000, { message: "Не больше 5000 строк за раз" }),
});

/**
 * Dry run: анализ строк в БД (import_stage). Пишутся только import_jobs / import_job_rows, справочники не меняются.
 * Применение — отдельным действием commitImport.
 */
export async function stageImport(input: unknown): Promise<Result<{ jobId: string }>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = stageSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid);
  const v = p.data;
  if (!canImportEntity(actor.role, v.entity)) return fail(WF_ERR.forbidden);
  if (v.entity === "PARTICIPANTS" && !v.trainingId) return fail("Выберите мероприятие, в которое импортируются участники.");
  if (v.source === "GSHEET") return fail("Импорт по ссылке Google Sheets будет доступен позже. Вставьте таблицу или загрузите CSV.");
  const options: Record<string, string> = {};
  if (v.entity === "PARTICIPANTS" && v.trainingId) options.training_id = v.trainingId;
  const res = await callRpc("import_stage", {
    p_entity: v.entity,
    p_source: v.source,
    p_file_name: v.fileName,
    p_file_hash: v.fileHash ?? (undefined as unknown as string),
    p_mapping: v.mapping as unknown as Json,
    p_options: options as unknown as Json,
    p_rows: v.rows as unknown as Json,
  });
  if (!res.ok) return res;
  refresh(res.data);
  return { ok: true, message: "Файл проанализирован. Проверьте результат перед применением.", data: { jobId: res.data } };
}

const resolveSchema = z.object({
  jobId: uuid,
  rowId: z.number().int().positive(),
  decision: z.enum(["APPLY", "SKIP", "MATCH"]),
  match: uuid.nullish(),
});

export async function resolveImportRow(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = resolveSchema.safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid);
  if (p.data.decision === "MATCH" && !p.data.match) return fail("Выберите сотрудника из справочника.");
  const res = await callRpc("import_resolve_row", { p_row: p.data.rowId, p_decision: p.data.decision, p_match: p.data.match ?? undefined });
  if (!res.ok) return res;
  refresh(p.data.jobId);
  return { ok: true, message: "Решение сохранено.", data: undefined };
}

export async function commitImport(input: { jobId: string; reason?: string | null }): Promise<Result<{ inserted: number; updated: number; skipped: number }>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const id = uuid.safeParse(input.jobId);
  const r = reason.safeParse(input.reason);
  if (!id.success) return fail(WF_ERR.notFound);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason);
  const res = await callRpc("import_commit", { p_job: id.data, p_reason: r.data });
  if (!res.ok) return res;
  const out = (res.data ?? {}) as { inserted?: number; updated?: number; skipped?: number };
  revalidatePath("/employees");
  revalidatePath("/trainings");
  refresh(id.data);
  const inserted = Number(out.inserted ?? 0), updated = Number(out.updated ?? 0), skipped = Number(out.skipped ?? 0);
  return { ok: true, message: `Импорт применён: добавлено ${inserted}, обновлено ${updated}, пропущено ${skipped}.`, data: { inserted, updated, skipped } };
}

export async function cancelImport(input: { jobId: string; reason?: string | null }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const id = uuid.safeParse(input.jobId);
  const r = reason.safeParse(input.reason);
  if (!id.success) return fail(WF_ERR.notFound);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason);
  const res = await callRpc("import_cancel", { p_job: id.data, p_reason: r.data });
  if (!res.ok) return res;
  refresh(id.data);
  return { ok: true, message: "Импорт отменён. Данные не изменены.", data: undefined };
}

export type EmployeeHit = { id: string; full_name: string; position: string | null; is_active: boolean };

/** Поиск сотрудника для ручного сопоставления строки (RLS: читают все роли раздела). */
export async function searchEmployeesForImport(query: string): Promise<Result<EmployeeHit[]>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const q = String(query ?? "").replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 2) return { ok: true, data: [] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("employees").select("id, full_name, position, is_active").ilike("full_name", `%${q}%`).order("is_active", { ascending: false }).order("full_name").limit(15);
    if (error) return fail(WF_ERR.unavailable);
    return { ok: true, data: (data ?? []).map((e) => ({ id: e.id, full_name: e.full_name, position: e.position, is_active: e.is_active })) };
  } catch {
    return fail(WF_ERR.unavailable);
  }
}

export type TrainingOption = { id: string; label: string };

/** Мероприятия для выбора при импорте участников (последние 200 не архивных). */
export async function listTrainingsForImport(): Promise<Result<TrainingOption[]>> {
  const actor = await requireRole(WF_ROLES.participants);
  if (!actor.ok) return actor;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("trainings").select("id, canonical_id, title, start_date").is("archived_at", null).order("start_date", { ascending: false }).limit(200);
    if (error) return fail(WF_ERR.unavailable);
    return { ok: true, data: (data ?? []).map((t) => ({ id: t.id, label: `${t.canonical_id} · ${t.title} · ${t.start_date}` })) };
  } catch {
    return fail(WF_ERR.unavailable);
  }
}

export type ImportSummary = {
  id: string; status: string; total: number; newRows: number; updatedRows: number; unchanged: number; duplicates: number; review: number; errors: number;
  unresolved: number;
};

/** Итоги dry run для диалога: счётчики и число нерешённых строк. */
export async function getImportSummary(jobId: string): Promise<Result<ImportSummary>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const id = uuid.safeParse(jobId);
  if (!id.success) return fail(WF_ERR.notFound);
  try {
    const supabase = await createClient();
    const { data: j, error } = await supabase.from("import_jobs").select("id, status, total_rows, new_rows, updated_rows, unchanged_rows, duplicate_rows, review_rows, error_rows").eq("id", id.data).maybeSingle();
    if (error || !j) return fail(WF_ERR.notFound);
    const { count } = await supabase.from("import_job_rows").select("id", { count: "exact", head: true }).eq("job_id", id.data).eq("status", "NEEDS_REVIEW").is("decision", null);
    return { ok: true, data: { id: j.id, status: j.status, total: j.total_rows, newRows: j.new_rows, updatedRows: j.updated_rows, unchanged: j.unchanged_rows, duplicates: j.duplicate_rows, review: j.review_rows, errors: j.error_rows, unresolved: count ?? 0 } };
  } catch {
    return fail(WF_ERR.unavailable);
  }
}
