import type { StageRow } from "./build";

/**
 * Пакетная передача импорта (HOTFIX 413).
 *
 * Загрузка: строки уходят на сервер частями — каждая часть отдельным Server Action, тело заметно меньше лимита 1 МБ.
 * Применение: сервер применяет сотрудников пакетами import_commit_batch; один вызов действия ограничен бюджетом времени,
 * клиент повторяет вызов, пока задание не станет COMMITTED. Любой вызов можно безопасно повторить.
 */

/** Строк в одной части загрузки (БД принимает до 1000). */
export const STAGE_CHUNK_ROWS = 300;
/** Предел сериализованной части. Лимит Server Actions — 1 МБ; запас на обёртку запроса и многобайтовую кириллицу. */
export const STAGE_CHUNK_BYTES = 512 * 1024;
/**
 * Пакет применения. Замер под ролью authenticated (2646 строк): 120 строк — 2,3–3,1 с (справочник 4–5 тыс.), 150 — 2,1–2,4 с,
 * 200 — 3,4–3,8 с. Стоимость строки растёт с размером справочника (next_employee_code просматривает всех сотрудников),
 * поэтому размер адаптивный: старт 120, цель ≈ 2,5 с на пакет (в 3 раза ниже лимита 8 с), границы 20…150.
 */
export const COMMIT_BATCH_ROWS = 120;
export const COMMIT_BATCH_MIN = 20;
export const COMMIT_BATCH_MAX = 150;
export const COMMIT_BATCH_TARGET_MS = 2_500;

/** Следующий размер пакета по длительности предыдущего. */
export function nextBatchSize(limit: number, elapsedMs: number, target = COMMIT_BATCH_TARGET_MS): number {
  if (!(elapsedMs > 0)) return limit;
  const proposed = Math.round((limit * target) / elapsedMs);
  const grown = Math.min(proposed, Math.ceil(limit * 1.5)); // рост не резче чем ×1,5 за шаг
  return Math.max(COMMIT_BATCH_MIN, Math.min(COMMIT_BATCH_MAX, grown));
}
/** Бюджет одного вызова действия применения: после него новый пакет не начинается (ответ укладывается в таймаут функции Vercel). */
export const COMMIT_BUDGET_MS = 6_000;

const enc = new TextEncoder();
export const jsonBytes = (v: unknown) => enc.encode(JSON.stringify(v)).length;

/**
 * Делит строки на части не больше maxRows и maxBytes (по JSON в UTF-8). Порядок сохраняется, строки не теряются.
 * Одна строка больше maxBytes — ошибка с номером строки (такую строку нельзя передать ни одной частью).
 */
export function chunkStageRows(rows: StageRow[], maxRows = STAGE_CHUNK_ROWS, maxBytes = STAGE_CHUNK_BYTES): { ok: true; chunks: StageRow[][] } | { ok: false; error: string } {
  const chunks: StageRow[][] = [];
  let cur: StageRow[] = [];
  let size = 2; // []
  for (const r of rows) {
    const b = jsonBytes(r) + 1;
    if (b + 2 > maxBytes) return { ok: false, error: `Строка ${r.row_no} слишком большая для загрузки (${Math.ceil(b / 1024)} КБ). Сократите текст в ячейках.` };
    if (cur.length >= maxRows || size + b > maxBytes) {
      chunks.push(cur);
      cur = [];
      size = 2;
    }
    cur.push(r);
    size += b;
  }
  if (cur.length) chunks.push(cur);
  return { ok: true, chunks };
}

export type CommitProgress = {
  status: string;
  remaining: number;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  apply_errors: number;
  /** Пакетов, выполненных этим вызовом. */
  batches: number;
  /** Размер следующего пакета (адаптивный). */
  limit: number;
};

export const isCommitDone = (p: Pick<CommitProgress, "status" | "remaining">) => p.status === "COMMITTED" && p.remaining === 0;

/** Приведение ответа import_commit_batch (jsonb) к прогрессу. */
export function parseBatchResult(v: unknown): Omit<CommitProgress, "batches" | "limit"> {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (k: string) => (Number.isFinite(Number(o[k])) ? Number(o[k]) : 0);
  return { status: String(o.status ?? ""), remaining: n("remaining"), total: n("total"), inserted: n("inserted"), updated: n("updated"), skipped: n("skipped"), apply_errors: n("apply_errors") };
}

type StepResult = { ok: true; data: unknown } | { ok: false; error: string };

/**
 * Выполняет пакеты подряд, пока задание не завершено и не исчерпан бюджет времени. Размер пакета подстраивается под
 * фактическую длительность (nextBatchSize). Ошибка пакета возвращается вместе с последним известным прогрессом:
 * пакет в БД откатился целиком, повтор безопасен.
 */
export async function runCommitBatches(
  step: (limit: number) => Promise<StepResult>,
  opts: { budgetMs?: number; now?: () => number; maxBatches?: number; initialLimit?: number } = {},
): Promise<{ ok: true; progress: CommitProgress } | { ok: false; error: string; progress: CommitProgress | null }> {
  const now = opts.now ?? (() => Date.now());
  const budget = opts.budgetMs ?? COMMIT_BUDGET_MS;
  const max = opts.maxBatches ?? 100;
  const start = now();
  let limit = Math.max(COMMIT_BATCH_MIN, Math.min(COMMIT_BATCH_MAX, opts.initialLimit ?? COMMIT_BATCH_ROWS));
  let last: CommitProgress | null = null;
  let batches = 0;
  while (batches < max) {
    const t0 = now();
    const r = await step(limit);
    if (!r.ok) return { ok: false, error: r.error, progress: last };
    batches++;
    limit = nextBatchSize(limit, now() - t0);
    last = { ...parseBatchResult(r.data), batches, limit };
    if (isCommitDone(last) || last.status !== "COMMITTING") break;
    if (now() - start >= budget) break;
  }
  return { ok: true, progress: last ?? { status: "", remaining: 0, total: 0, inserted: 0, updated: 0, skipped: 0, apply_errors: 0, batches, limit } };
}

/** Понятный текст для исключения при вызове действия (сеть, лимит тела запроса, перезапуск сервера). */
export function actionErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e ?? "");
  if (/body exceeded|413|payload too large/i.test(m)) return "Слишком большой запрос: часть строк превышает допустимый размер. Сократите текст в ячейках или разбейте файл.";
  return "Нет связи с сервером. Проверьте подключение и повторите — уже принятые строки не дублируются.";
}

/** Вызов действия без исключений: ошибка превращается в { ok: false, error }. */
export async function safeAction<T extends { ok: boolean }>(f: () => Promise<T>): Promise<T | { ok: false; error: string }> {
  try {
    return await f();
  } catch (e) {
    return { ok: false, error: actionErrorMessage(e) };
  }
}
