import { reanalyzeOrgMapBatch, saveOrgMap, previewOrgMap, type OrgMapItem, type OrgMapItemResult, type OrgMapResult } from "@/app/(app)/imports/orgmap-actions";
import { safeAction } from "@/lib/imports/batch";
import { chunkItems } from "@/lib/imports/orgmap";

const MAX_STEPS = 400; // предохранитель
export const REANALYZE_ROWS = 100; // ≈7 мс на строку локально; пачка короче лимита 8 с с запасом

export type ReanalyzeTotals = { processed: number; resolved: number; unresolved: number; errors: number; firstError: string | null };

/** Пакетный повторный разбор всех нерешённых строк с курсором; каждый шаг идемпотентен, после сбоя можно запустить заново. */
export async function runReanalyzeAll(jobId: string, total: number, onProgress: (done: number, total: number) => void): Promise<{ ok: true; totals: ReanalyzeTotals } | { ok: false; error: string; totals: ReanalyzeTotals }> {
  const t: ReanalyzeTotals = { processed: 0, resolved: 0, unresolved: 0, errors: 0, firstError: null };
  let after = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const r = await safeAction(() => reanalyzeOrgMapBatch({ jobId, after, limit: REANALYZE_ROWS }));
    if (!r.ok) return { ok: false, error: r.error, totals: t };
    after = r.data.nextAfter; t.processed += r.data.processed; t.resolved += r.data.resolved; t.unresolved += r.data.unresolved; t.errors += r.data.errors; t.firstError = t.firstError ?? r.data.firstError;
    onProgress(t.processed, total);
    if (r.data.done) return { ok: true, totals: t };
  }
  return { ok: false, error: "Разбор не завершён за отведённое число шагов. Запустите снова — повтор безопасен.", totals: t };
}

export type MapRunResult = Omit<OrgMapResult, "items" | "dry"> & { items: OrgMapItemResult[] };
const EMPTY: MapRunResult = { ok: 0, failed: 0, mapped: 0, aliases: 0, created: 0, cleared: 0, rowsAffected: 0, items: [] };

/** Предпросмотр или сохранение по частям (≤50 значений за вызов; департаменты раньше отделов). Сохранённые части остаются при сбое следующих. */
export async function runOrgMap(jobId: string, items: OrgMapItem[], mode: { dry: true } | { dry: false; reason: string }, onProgress?: (done: number, total: number) => void): Promise<{ ok: true; result: MapRunResult } | { ok: false; error: string; result: MapRunResult }> {
  const acc: MapRunResult = { ...EMPTY, items: [] };
  let done = 0;
  for (const part of chunkItems(items)) {
    const r = await safeAction(() => (mode.dry ? previewOrgMap({ jobId, items: part }) : saveOrgMap({ jobId, items: part, reason: mode.reason, confirmed: true })));
    if (!r.ok) return { ok: false, error: r.error, result: acc };
    acc.ok += r.data.ok; acc.failed += r.data.failed; acc.mapped += r.data.mapped; acc.aliases += r.data.aliases; acc.created += r.data.created; acc.cleared += r.data.cleared; acc.rowsAffected += r.data.rowsAffected;
    acc.items.push(...r.data.items);
    done += part.length; onProgress?.(done, items.length);
  }
  return { ok: true, result: acc };
}

/** Выбор тех пунктов, которые предпросмотр признал допустимыми (по виду+значению+контексту+действию). */
export function onlyAccepted(items: OrgMapItem[], result: MapRunResult): OrgMapItem[] {
  const okKeys = new Set(result.items.filter((i) => i.ok).map((i) => `${i.kind}|${i.scope}|${i.srcName.trim()}|${i.action}`));
  return items.filter((i) => okKeys.has(`${i.kind}|${i.scope}|${i.srcName.trim()}|${i.action}`));
}
