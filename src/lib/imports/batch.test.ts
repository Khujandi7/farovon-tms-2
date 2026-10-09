import { describe, expect, it } from "vitest";
import { actionErrorMessage, chunkStageRows, isCommitDone, jsonBytes, parseBatchResult, runCommitBatches, safeAction } from "./batch";
import type { StageRow } from "./build";

const row = (n: number, extra = ""): StageRow => ({
  row_no: n,
  raw: { "Таб. №": `F-${n}`, ФИО: `Сотрудников Сотрудник ${n}`, Должность: "Бухгалтер", Департамент: "Финансовый департамент", Комментарий: extra },
  data: { employee_code: `F-${n}`, full_name: `Сотрудников Сотрудник ${n}`, position: "Бухгалтер", department: "Финансовый департамент" },
});
const rows = (n: number, extra = "") => Array.from({ length: n }, (_, i) => row(i + 2, extra));

describe("chunkStageRows — пакетная передача строк", () => {
  it("2646 сотрудников целиком превышают 1 МБ, а каждая часть — нет", () => {
    // реалистичная строка кадровой выгрузки: 20+ колонок, кириллица (2 байта на символ)
    const all = rows(2646, "Примечание кадровой службы: перевод из другого подразделения, приказ №".repeat(3));
    expect(jsonBytes(all)).toBeGreaterThan(1024 * 1024); // так выглядел прежний запрос, который получал 413
    const r = chunkStageRows(all);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    for (const c of r.chunks) {
      expect(c.length).toBeLessThanOrEqual(300);
      expect(jsonBytes({ jobId: "00000000-0000-0000-0000-000000000000", rows: c })).toBeLessThan(1024 * 1024);
    }
  });

  it("порядок сохраняется, строки не теряются и не дублируются", () => {
    const all = rows(1001);
    const r = chunkStageRows(all, 300);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chunks.map((c) => c.length)).toEqual([300, 300, 300, 101]);
    expect(r.chunks.flat().map((x) => x.row_no)).toEqual(all.map((x) => x.row_no));
  });

  it("часть закрывается по размеру раньше, чем по числу строк", () => {
    const all = rows(50, "x".repeat(4000));
    const r = chunkStageRows(all, 300, 64 * 1024);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.chunks.length).toBeGreaterThan(1);
    for (const c of r.chunks) expect(jsonBytes(c)).toBeLessThanOrEqual(64 * 1024);
  });

  it("одна строка больше предела — понятная ошибка с номером строки", () => {
    const r = chunkStageRows([row(2), row(3, "я".repeat(40_000))], 300, 32 * 1024);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("Строка 3");
  });

  it("пустой список — ноль частей", () => {
    const r = chunkStageRows([]);
    expect(r.ok && r.chunks.length).toBe(0);
  });
});

describe("runCommitBatches — пакетное применение", () => {
  const batch = (status: string, remaining: number, total = 351) => ({ ok: true as const, data: { status, remaining, total, inserted: total - remaining, updated: 0, skipped: 0, apply_errors: 0 } });

  it("крутит пакеты до COMMITTED и не идёт дальше", async () => {
    const answers = [batch("COMMITTING", 231), batch("COMMITTING", 111), batch("COMMITTED", 0)];
    let calls = 0;
    const r = await runCommitBatches(async () => answers[calls++]!, { budgetMs: 60_000 });
    expect(calls).toBe(3);
    expect(r.ok && r.progress.status).toBe("COMMITTED");
    expect(r.ok && r.progress.batches).toBe(3);
    expect(r.ok && isCommitDone(r.progress)).toBe(true);
  });

  it("останавливается по бюджету времени, не объявляя завершение", async () => {
    let t = 0;
    let calls = 0;
    const r = await runCommitBatches(async () => { calls++; t += 2_500; return batch("COMMITTING", 1000 - 120 * calls, 1000); }, { budgetMs: 6_000, now: () => t });
    expect(calls).toBe(3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(isCommitDone(r.progress)).toBe(false);
    expect(r.progress.remaining).toBeGreaterThan(0);
  });

  it("ошибка пакета возвращается вместе с последним прогрессом (повтор безопасен)", async () => {
    let calls = 0;
    const r = await runCommitBatches(async () => (++calls === 1 ? batch("COMMITTING", 231) : { ok: false as const, error: "canceling statement due to statement timeout" }), { budgetMs: 60_000 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("timeout");
    expect(r.progress?.remaining).toBe(231);
  });

  it("предохранитель по числу пакетов", async () => {
    let calls = 0;
    const r = await runCommitBatches(async () => { calls++; return batch("COMMITTING", 100); }, { budgetMs: 1e9, maxBatches: 5 });
    expect(calls).toBe(5);
    expect(r.ok && isCommitDone(r.progress)).toBe(false);
  });

  it("повтор после завершения сразу возвращает итог", async () => {
    let calls = 0;
    const r = await runCommitBatches(async () => { calls++; return batch("COMMITTED", 0); });
    expect(calls).toBe(1);
    expect(r.ok && r.progress.status).toBe("COMMITTED");
  });

  it("parseBatchResult переносит счётчики и не падает на мусоре", () => {
    expect(parseBatchResult({ status: "COMMITTING", remaining: 5, total: 10, inserted: 3, updated: 1, skipped: 1, apply_errors: 0 })).toEqual({ status: "COMMITTING", remaining: 5, total: 10, inserted: 3, updated: 1, skipped: 1, apply_errors: 0 });
    expect(parseBatchResult(null)).toEqual({ status: "", remaining: 0, total: 0, inserted: 0, updated: 0, skipped: 0, apply_errors: 0 });
  });
});

describe("ошибки вызова действий", () => {
  it("превышение лимита тела — понятное сообщение", () => {
    expect(actionErrorMessage(new Error("Body exceeded 1 MB limit"))).toContain("Слишком большой запрос");
  });
  it("сетевой сбой — предложение повторить без дублей", () => {
    expect(actionErrorMessage(new Error("Failed to fetch"))).toContain("не дублируются");
  });
  it("safeAction превращает исключение в { ok: false }", async () => {
    const r = await safeAction(async () => { throw new Error("Body exceeded 1 MB limit"); });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("Слишком большой запрос") });
  });
  it("safeAction пропускает обычный результат", async () => {
    await expect(safeAction(async () => ({ ok: true as const, data: 1 }))).resolves.toEqual({ ok: true, data: 1 });
  });
});

describe("адаптивный размер пакета", () => {
  it("медленный пакет уменьшает следующий, быстрый — увеличивает не резче ×1,5", async () => {
    const { nextBatchSize, COMMIT_BATCH_MAX, COMMIT_BATCH_MIN } = await import("./batch");
    expect(nextBatchSize(120, 6_000)).toBe(50); // 6 с → цель 2,5 с
    expect(nextBatchSize(120, 1_000)).toBe(COMMIT_BATCH_MAX); // рост ограничен 150
    expect(nextBatchSize(40, 1_000)).toBe(60); // ×1,5 за шаг
    expect(nextBatchSize(30, 60_000)).toBe(COMMIT_BATCH_MIN); // не меньше 20
    expect(nextBatchSize(120, 0)).toBe(120);
  });

  it("runCommitBatches передаёт уменьшенный размер следующему пакету", async () => {
    let t = 0;
    const limits: number[] = [];
    const r = await runCommitBatches(async (limit) => {
      limits.push(limit);
      t += limits.length === 1 ? 5_000 : 2_500; // первый пакет медленный
      return { ok: true as const, data: { status: limits.length === 3 ? "COMMITTED" : "COMMITTING", remaining: limits.length === 3 ? 0 : 100, total: 300 } };
    }, { budgetMs: 1e9, now: () => t });
    expect(limits).toEqual([120, 60, 60]);
    expect(r.ok && r.progress.limit).toBe(60);
  });
});
