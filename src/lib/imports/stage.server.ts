import "server-only";
import { callRpc, type Result } from "@/lib/workflows/server";
import type { Json } from "@/types/database";
import { COMMIT_BATCH_ROWS, chunkStageRows, runCommitBatches, type CommitProgress } from "./batch";
import type { StageRow } from "./build";

/**
 * Серверные шаги пакетного импорта (HOTFIX 413 / таймаут 8 с). Все вызовы — под сессией пользователя (RLS, can_import).
 * Используются действиями мастера (по одной части за вызов) и синхронизацией Google Sheets (всё на сервере).
 */

export type StageHeader = {
  entity: string;
  source: "XLSX" | "CSV" | "PASTE" | "GSHEET";
  fileName: string;
  fileHash: string | null;
  mapping: Record<string, number | null>;
  options: Record<string, string>;
  total: number;
  token: string;
};

export async function stageBegin(h: StageHeader): Promise<Result<string>> {
  const r = await callRpc("import_stage_begin", {
    p_entity: h.entity, p_source: h.source, p_file_name: h.fileName, p_file_hash: h.fileHash ?? (undefined as unknown as string),
    p_mapping: h.mapping as unknown as Json, p_options: h.options as unknown as Json, p_total: h.total, p_token: h.token,
  });
  return r.ok ? { ok: true, data: String(r.data) } : r;
}

export async function stageAppend(jobId: string, rows: StageRow[]): Promise<Result<{ received: number; expected: number }>> {
  const r = await callRpc("import_stage_append", { p_job: jobId, p_rows: rows as unknown as Json });
  if (!r.ok) return r;
  const o = (r.data ?? {}) as { received?: number; expected?: number };
  return { ok: true, data: { received: Number(o.received ?? 0), expected: Number(o.expected ?? 0) } };
}

export async function stageFinish(jobId: string): Promise<Result<string>> {
  const r = await callRpc("import_stage_finish", { p_job: jobId });
  return r.ok ? { ok: true, data: String(r.data) } : r;
}

/** Вся загрузка на сервере (Google Sheets): begin → части → finish. Повтор части безопасен, поэтому одна повторная попытка на часть. */
export async function stageAllOnServer(h: Omit<StageHeader, "total">, rows: StageRow[]): Promise<Result<string>> {
  const split = chunkStageRows(rows);
  if (!split.ok) return { ok: false, error: split.error };
  const job = await stageBegin({ ...h, total: rows.length });
  if (!job.ok) return job;
  for (const part of split.chunks) {
    let res = await stageAppend(job.data, part);
    if (!res.ok) res = await stageAppend(job.data, part);
    if (!res.ok) {
      await callRpc("import_stage_abort", { p_job: job.data });
      return res;
    }
  }
  return stageFinish(job.data);
}

/** Пакеты применения в пределах бюджета времени одного запроса; размер пакета адаптивный (старт initialLimit). */
export async function commitBatchesWithinBudget(jobId: string, reason: string | null, budgetMs?: number, initialLimit = COMMIT_BATCH_ROWS) {
  return runCommitBatches(
    (limit) => callRpc("import_commit_batch", { p_job: jobId, p_limit: limit, p_reason: reason ?? (undefined as unknown as string) }),
    { budgetMs, initialLimit },
  );
}

export type { CommitProgress };
