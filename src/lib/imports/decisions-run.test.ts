import { beforeEach, describe, expect, it, vi } from "vitest";

const bulk = vi.fn();
const apply = vi.fn();
vi.mock("@/app/(app)/imports/decisions-actions", () => ({ resolveImportRowsBulk: (...a: unknown[]) => bulk(...a), applyImportDecisions: (...a: unknown[]) => apply(...a) }));

import { runApplyDecisions, runBulkDecision } from "./decisions-run";

describe("runBulkDecision", () => {
  beforeEach(() => vi.clearAllMocks());
  it("повторяет шаги, пока не done, и суммирует", async () => {
    bulk.mockResolvedValueOnce({ ok: true, data: { changed: 300, remaining: 50, done: false } }).mockResolvedValueOnce({ ok: true, data: { changed: 50, remaining: 0, done: true } });
    expect(await runBulkDecision("j", "APPLY")).toEqual({ ok: true, changed: 350 });
    expect(bulk).toHaveBeenCalledTimes(2);
  });
  it("не зацикливается, если сервер ничего не меняет", async () => {
    bulk.mockResolvedValue({ ok: true, data: { changed: 0, remaining: 5, done: false } });
    expect(await runBulkDecision("j", "SKIP")).toEqual({ ok: true, changed: 0 });
    expect(bulk).toHaveBeenCalledTimes(1);
  });
  it("ошибка шага возвращается вместе с уже сохранённым числом", async () => {
    bulk.mockResolvedValueOnce({ ok: true, data: { changed: 300, remaining: 50, done: false } }).mockResolvedValueOnce({ ok: false, error: "Сбой" });
    expect(await runBulkDecision("j", "APPLY")).toEqual({ ok: false, error: "Сбой", changed: 300 });
  });
});

describe("runApplyDecisions", () => {
  beforeEach(() => vi.clearAllMocks());
  it("идёт по курсору next_after и показывает прогресс", async () => {
    apply
      .mockResolvedValueOnce({ ok: true, data: { processed: 40, created: 30, updated: 10, errors: 0, remaining: 5, nextAfter: 900, done: false } })
      .mockResolvedValueOnce({ ok: true, data: { processed: 5, created: 4, updated: 0, errors: 1, remaining: 0, nextAfter: 950, done: true } });
    const seen: Array<[number, number]> = [];
    const r = await runApplyDecisions("j", "Причина", 45, (d, t) => seen.push([d, t]));
    expect(r).toEqual({ ok: true, totals: { created: 34, updated: 10, errors: 1, processed: 45 } });
    expect(apply.mock.calls[0]![0]).toMatchObject({ jobId: "j", after: 0, confirmed: true, reason: "Причина" });
    expect(apply.mock.calls[1]![0]).toMatchObject({ after: 900 });
    expect(seen).toEqual([[40, 45], [45, 45]]);
  });
  it("после сбоя возвращает итоги уже применённого", async () => {
    apply.mockResolvedValueOnce({ ok: true, data: { processed: 40, created: 40, updated: 0, errors: 0, remaining: 9, nextAfter: 500, done: false } }).mockResolvedValueOnce({ ok: false, error: "Операция прервана" });
    const r = await runApplyDecisions("j", "Причина", 49, () => {});
    expect(r).toMatchObject({ ok: false, error: "Операция прервана", totals: { created: 40, processed: 40 } });
  });
});
