"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { optReason, reason, uuid } from "@/lib/workflows/schemas";
import { canImportEntity, IMPORT_ENTITIES } from "@/lib/imports/entities";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { COMMIT_BATCH_MAX, COMMIT_BATCH_MIN, STAGE_CHUNK_ROWS, isCommitDone, type CommitProgress } from "@/lib/imports/batch";
import { commitBatchesWithinBudget, stageAppend, stageBegin, stageFinish } from "@/lib/imports/stage.server";

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
  /** Сохранённый источник Google Sheets (Phase 3B): связывает dry run с источником для итогов синхронизации. */
  sourceId: uuid.nullish(),
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
  if (v.sourceId && v.entity !== "EMPLOYEES") return fail(WF_ERR.invalid);
  const options: Record<string, string> = {};
  if (v.entity === "PARTICIPANTS" && v.trainingId) options.training_id = v.trainingId;
  if (v.sourceId) options.source_id = v.sourceId;
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
  if (v.sourceId) await callRpc("record_source_sync", { p_source: v.sourceId, p_job: res.data });
  refresh(res.data);
  return { ok: true, message: "Файл проанализирован. Проверьте результат перед применением.", data: { jobId: res.data } };
}

// ---------- Пакетная загрузка (HOTFIX 413): begin → части → finish. Тело каждого вызова — одна часть, а не весь файл. ----------

const beginSchema = z.object({
  entity: z.enum(IMPORT_ENTITIES),
  source: z.enum(["XLSX", "CSV", "PASTE", "GSHEET"]),
  fileName: z.string().trim().min(1).max(200),
  fileHash: z.string().regex(/^[0-9a-f]{64}$/).nullish(),
  mapping: z.record(z.string().max(40), z.number().int().min(0).max(200).nullable()),
  trainingId: uuid.nullish(),
  sourceId: uuid.nullish(),
  total: z.number().int().min(1, { message: "В файле нет строк" }).max(5000, { message: "Не больше 5000 строк за раз" }),
  /** Идентификатор загрузки из браузера: повтор begin (сетевой сбой, двойной клик) возвращает то же задание. */
  token: uuid,
});

/** Шаг 1: создать задание (статус «загрузка»). Справочники не меняются. */
export async function beginImportStage(input: unknown): Promise<Result<{ jobId: string }>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = beginSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid);
  const v = p.data;
  if (!canImportEntity(actor.role, v.entity)) return fail(WF_ERR.forbidden);
  if (v.entity === "PARTICIPANTS" && !v.trainingId) return fail("Выберите мероприятие, в которое импортируются участники.");
  if (v.sourceId && v.entity !== "EMPLOYEES") return fail(WF_ERR.invalid);
  const options: Record<string, string> = {};
  if (v.entity === "PARTICIPANTS" && v.trainingId) options.training_id = v.trainingId;
  if (v.sourceId) options.source_id = v.sourceId;
  const res = await stageBegin({ entity: v.entity, source: v.source, fileName: v.fileName, fileHash: v.fileHash ?? null, mapping: v.mapping, options, total: v.total, token: v.token });
  return res.ok ? { ok: true, data: { jobId: res.data } } : res;
}

const appendSchema = z.object({
  jobId: uuid,
  rows: z.array(rowSchema).min(1).max(STAGE_CHUNK_ROWS, { message: `Не больше ${STAGE_CHUNK_ROWS} строк в одной части` }),
});

/** Шаг 2: одна часть строк. Повтор той же части безопасен: уже принятые строки пропускаются. */
export async function appendImportRows(input: unknown): Promise<Result<{ received: number; expected: number }>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = appendSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid);
  return stageAppend(p.data.jobId, p.data.rows);
}

/** Шаг 3: все части получены — повторы в файле, замечания DQ, итоги; задание становится «ожидает применения». */
export async function finishImportStage(input: unknown): Promise<Result<{ jobId: string }>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const id = uuid.safeParse((input as { jobId?: unknown })?.jobId);
  if (!id.success) return fail(WF_ERR.notFound);
  const res = await stageFinish(id.data);
  if (!res.ok) return res;
  await finishSourceSync(id.data);
  refresh(id.data);
  return { ok: true, message: "Файл проанализирован. Проверьте результат перед применением.", data: { jobId: id.data } };
}

/** Прерванная загрузка: задание отменяется, справочники не затронуты. */
export async function abortImportStage(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const id = uuid.safeParse((input as { jobId?: unknown })?.jobId);
  if (!id.success) return fail(WF_ERR.notFound);
  const res = await callRpc("import_stage_abort", { p_job: id.data });
  if (!res.ok) return res;
  refresh(id.data);
  return { ok: true, data: undefined };
}

// ---------- Пакетное применение (сотрудники): каждый вызов — несколько пакетов в пределах бюджета времени ----------

export type CommitStep = CommitProgress & { done: boolean };

/**
 * Применение импорта. Сотрудники — пакетами import_commit_batch: вызов возвращает прогресс, клиент повторяет до done.
 * Остальные сущности — прежним import_commit одной транзакцией. Причина нужна только для первого пакета (задание STAGED).
 */
export async function commitImportStep(input: { jobId: string; reason?: string | null; limit?: number | null }): Promise<Result<CommitStep>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const id = uuid.safeParse(input?.jobId);
  if (!id.success) return fail(WF_ERR.notFound);
  const supabase = await createClient();
  const { data: job } = await supabase.from("import_jobs").select("entity, status").eq("id", id.data).maybeSingle();
  if (!job) return fail(WF_ERR.notFound);
  const needsReason = job.status === "STAGED";
  const r = needsReason ? reason.safeParse(input.reason) : optReason.safeParse(input.reason);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason);

  if (job.entity !== "EMPLOYEES") {
    const res = await commitImport({ jobId: id.data, reason: r.data });
    if (!res.ok) return res;
    return { ok: true, message: res.message, data: { status: "COMMITTED", remaining: 0, total: 0, inserted: res.data.inserted, updated: res.data.updated, skipped: res.data.skipped, apply_errors: 0, batches: 1, limit: 0, done: true } };
  }

  // размер пакета с прошлого шага (адаптивный), в допустимых границах; иначе — стартовый
  const lim = Number.isInteger(input.limit) ? Math.min(COMMIT_BATCH_MAX, Math.max(COMMIT_BATCH_MIN, Number(input.limit))) : undefined;
  const run = await commitBatchesWithinBudget(id.data, r.data ?? null, undefined, lim);
  refresh(id.data);
  if (!run.ok) {
    return fail(`Применение остановлено: ${run.error} Уже применённые строки сохранены; нажмите «Продолжить» — повтор безопасен.`);
  }
  const done = isCommitDone(run.progress);
  if (done) {
    await finishSourceSync(id.data);
    revalidatePath("/employees");
  }
  const pr = run.progress;
  const message = done
    ? `Импорт применён: добавлено ${pr.inserted}, обновлено ${pr.updated}, пропущено ${pr.skipped}${pr.apply_errors ? `, с ошибкой ${pr.apply_errors}` : ""}.`
    : `Применено ${pr.total - pr.remaining} из ${pr.total} строк…`;
  return { ok: true, message, data: { ...pr, done } };
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

/**
 * Повторная проверка строки «Подразделение не найдено» после того, как подразделение создано или написание сопоставлено.
 * Остальные данные строки не меняются; если подразделение разрешилось — строка становится обычной (NEW/UPDATED), замечание Data Quality закрывается.
 */
export async function reanalyzeImportRow(input: unknown): Promise<Result<{ resolved: boolean; messages: string[] }>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = z.object({ jobId: uuid, rowId: z.coerce.number().int().positive() }).safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid);
  const res = await callRpc("import_reanalyze_row", { p_row: p.data.rowId });
  if (!res.ok) return res;
  const o = (res.data ?? {}) as { resolved?: boolean; messages?: string[] };
  refresh(p.data.jobId);
  revalidatePath("/data-quality");
  const resolved = Boolean(o.resolved);
  return { ok: true, message: resolved ? "Подразделение найдено: строка проверена повторно." : "Подразделение всё ещё не найдено. Создайте его или сопоставьте написание.", data: { resolved, messages: o.messages ?? [] } };
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
  await finishSourceSync(id.data);
  revalidatePath("/employees");
  revalidatePath("/trainings");
  refresh(id.data);
  const inserted = Number(out.inserted ?? 0), updated = Number(out.updated ?? 0), skipped = Number(out.skipped ?? 0);
  return { ok: true, message: `Импорт применён: добавлено ${inserted}, обновлено ${updated}, пропущено ${skipped}.`, data: { inserted, updated, skipped } };
}

/** Если импорт относится к сохранённому источнику Google Sheets — записать итог и сверить «кого нет в таблице». */
async function finishSourceSync(jobId: string) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("import_jobs").select("options").eq("id", jobId).maybeSingle();
    const sourceId = (data?.options as { source_id?: string } | null)?.source_id;
    if (sourceId && uuid.safeParse(sourceId).success) {
      await callRpc("record_source_sync", { p_source: sourceId, p_job: jobId });
      revalidatePath("/employees/import");
    }
  } catch {
    // итог источника — служебная информация; применение импорта уже выполнено
  }
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
  await finishSourceSync(id.data);
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
