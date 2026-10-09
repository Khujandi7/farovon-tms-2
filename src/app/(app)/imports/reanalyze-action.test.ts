// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { reanalyzeImportRow } from "./actions";

const JOB = "dddddddd-dddd-4ddd-8ddd-000000000002";
const as = (role: string) => getSession.mockResolvedValue({ status: "ok", role, userId: "u1" });

// HOTFIX M25: действие вызывает существующую функцию БД и не зависит от статуса задания на сервере приложения —
// допустимость (STAGED/COMMITTED) решает import_reanalyze_row; SQL-регресс — supabase/tests/hotfix2_reanalyze_tests.sql.
describe("reanalyzeImportRow", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });

  it("вызывает import_reanalyze_row с id строки и возвращает признак разрешения", async () => {
    rpc.mockResolvedValue({ data: { resolved: true, status: "NEW", noop: false, messages: ["Подразделение найдено в справочнике"] }, error: null });
    const r = await reanalyzeImportRow({ jobId: JOB, rowId: 501 });
    expect(rpc).toHaveBeenCalledWith("import_reanalyze_row", { p_row: 501 });
    expect(r).toMatchObject({ ok: true, data: { resolved: true } });
  });

  it("не разрешилось: ok, но resolved=false и подсказка", async () => {
    rpc.mockResolvedValue({ data: { resolved: false, status: "NEEDS_REVIEW", messages: ["Отдел «Цех» не найден"] }, error: null });
    const r = await reanalyzeImportRow({ jobId: JOB, rowId: 7 });
    expect(r).toMatchObject({ ok: true, data: { resolved: false, messages: ["Отдел «Цех» не найден"] } });
  });

  it("ошибка БД (например, отменённый импорт) показывается как есть", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Импорт уже завершён", code: "P0015" } });
    expect(await reanalyzeImportRow({ jobId: JOB, rowId: 7 })).toMatchObject({ ok: false });
  });

  it("неверные аргументы и роли без права не доходят до БД", async () => {
    expect(await reanalyzeImportRow({ jobId: "x", rowId: 7 })).toMatchObject({ ok: false });
    expect(await reanalyzeImportRow({ jobId: JOB, rowId: 0 })).toMatchObject({ ok: false });
    as("VIEWER");
    expect(await reanalyzeImportRow({ jobId: JOB, rowId: 7 })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});
