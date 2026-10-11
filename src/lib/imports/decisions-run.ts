import { applyImportDecisions, resolveImportRowsBulk } from "@/app/(app)/imports/decisions-actions";
import { COMMIT_BATCH_MIN, nextBatchSize, safeAction } from "@/lib/imports/batch";

const MAX_STEPS = 400; // предохранитель
export const DECISIONS_APPLY_START = 40; // создание сотрудника ≈20–40 мс на строку; размер пакета адаптивный, цель ≈2,5 с
export const DECISIONS_APPLY_MAX = 100;

export type ApplyDecisionsTotals = { created: number; updated: number; errors: number; processed: number };

/** Массовое решение шагами по 300 строк, пока есть подходящие без решения (или с решением — для «снять»). Повтор безопасен. */
export async function runBulkDecision(jobId: string, decision: "APPLY" | "SKIP" | "CLEAR"): Promise<{ ok: true; changed: number } | { ok: false; error: string; changed: number }> {
  let changed = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const r = await safeAction(() => resolveImportRowsBulk({ jobId, decision }));
    if (!r.ok) return { ok: false, error: r.error, changed };
    changed += r.data.changed;
    if (r.data.done || r.data.changed === 0) return { ok: true, changed };
  }
  return { ok: false, error: "Решения сохранены не полностью. Нажмите кнопку ещё раз — повтор безопасен.", changed };
}

/** Применение решений пакетами с курсором; каждый шаг атомарен и идемпотентен, после сбоя или перезагрузки можно продолжить. */
export async function runApplyDecisions(
  jobId: string,
  reason: string,
  total: number,
  onProgress: (done: number, total: number) => void,
): Promise<{ ok: true; totals: ApplyDecisionsTotals } | { ok: false; error: string; totals: ApplyDecisionsTotals }> {
  const t: ApplyDecisionsTotals = { created: 0, updated: 0, errors: 0, processed: 0 };
  let after = 0;
  let limit = DECISIONS_APPLY_START;
  for (let i = 0; i < MAX_STEPS; i++) {
    const t0 = performance.now();
    const lim = Math.max(COMMIT_BATCH_MIN, Math.min(DECISIONS_APPLY_MAX, limit));
    const r = await safeAction(() => applyImportDecisions({ jobId, after, limit: lim, reason, confirmed: true }));
    limit = nextBatchSize(lim, performance.now() - t0);
    if (!r.ok) return { ok: false, error: r.error, totals: t };
    after = r.data.nextAfter;
    t.created += r.data.created; t.updated += r.data.updated; t.errors += r.data.errors; t.processed += r.data.processed;
    onProgress(t.processed, total);
    if (r.data.done) return { ok: true, totals: t };
  }
  return { ok: false, error: "Применение не завершено за отведённое число шагов. Нажмите «Применить решения» снова — повтор безопасен.", totals: t };
}
