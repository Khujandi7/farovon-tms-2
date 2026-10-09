// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyResolvedRows, previewResolvedRows, reanalyzeImportJob } from "./actions";

const JOB = "dddddddd-dddd-4ddd-8ddd-000000000003";
const as = (role: string) => getSession.mockResolvedValue({ status: "ok", role, userId: "u1" });

// M26: дозавершение применённого импорта. Логику (дубли, сбои, идемпотентность) проверяет SQL-набор hotfix3_apply_resolved_tests.sql.
describe("reanalyzeImportJob", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });
  it("вызывает import_reanalyze_job с курсором и возвращает прогресс", async () => {
    rpc.mockResolvedValue({ data: { processed: 100, resolved: 90, unresolved: 10, errors: 0, remaining: 40, next_after: 777, done: false, first_error: null }, error: null });
    const r = await reanalyzeImportJob({ jobId: JOB, after: 12, limit: 100 });
    expect(rpc).toHaveBeenCalledWith("import_reanalyze_job", { p_job: JOB, p_limit: 100, p_after: 12 });
    expect(r).toMatchObject({ ok: true, data: { processed: 100, resolved: 90, unresolved: 10, nextAfter: 777, done: false } });
  });
  it("неверные аргументы и роли без права не доходят до БД", async () => {
    expect(await reanalyzeImportJob({ jobId: "x" })).toMatchObject({ ok: false });
    expect(await reanalyzeImportJob({ jobId: JOB, limit: 5000 })).toMatchObject({ ok: false });
    as("VIEWER");
    expect(await reanalyzeImportJob({ jobId: JOB })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("previewResolvedRows", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });
  it("приводит snake_case ответа БД к модели и ничего не пишет", async () => {
    rpc.mockResolvedValue({ data: { job_status: "COMMITTED", total: 2646, ready: 2000, ready_create: 1900, ready_update: 100, unresolved_units: 600, needs_decision: 3, skipped_by_decision: 2, errors: 1, already_applied: 40, completed_now: 0, unchanged_after: 0,
      sample: [{ row_no: 2, full_name: "Тестов Тест", employee_code: "F-1", verdict: "CREATE" }, { row_no: 3, full_name: "Иванов", verdict: "???" }] }, error: null });
    const r = await previewResolvedRows({ jobId: JOB });
    expect(rpc).toHaveBeenCalledWith("import_resolved_preview", { p_job: JOB });
    expect(r).toMatchObject({ ok: true, data: { ready: 2000, readyCreate: 1900, readyUpdate: 100, unresolvedUnits: 600, needsDecision: 3, errors: 1, sample: [{ verdict: "CREATE" }, { verdict: "REVIEW", employeeCode: null }] } });
  });
});

describe("applyResolvedRows — только с подтверждением и причиной", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });
  const ok = { jobId: JOB, after: 0, limit: 40, reason: "Дозавершение после исправления справочника", confirmed: true };
  it("без confirmed:true или без причины в БД не уходит", async () => {
    expect(await applyResolvedRows({ ...ok, confirmed: false })).toMatchObject({ ok: false });
    expect(await applyResolvedRows({ ...ok, confirmed: undefined })).toMatchObject({ ok: false });
    expect(await applyResolvedRows({ ...ok, reason: "" })).toMatchObject({ ok: false });
    expect(await applyResolvedRows({ ...ok, limit: 1000 })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("с подтверждением вызывает import_apply_resolved_batch и возвращает итог шага", async () => {
    rpc.mockResolvedValue({ data: { processed: 40, created: 35, updated: 3, unchanged: 1, needs_review: 1, errors: 0, next_after: 96, remaining: 12, done: false }, error: null });
    const r = await applyResolvedRows(ok);
    expect(rpc).toHaveBeenCalledWith("import_apply_resolved_batch", { p_job: JOB, p_limit: 40, p_after: 0, p_reason: ok.reason });
    expect(r).toMatchObject({ ok: true, data: { created: 35, updated: 3, unchanged: 1, needsReview: 1, errors: 0, nextAfter: 96, remaining: 12, done: false } });
  });
  it("ошибка БД (не применённое задание) показывается как есть; роли без права не доходят до БД", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Дозавершение доступно только для применённого импорта", code: "P0015" } });
    expect(await applyResolvedRows(ok)).toMatchObject({ ok: false });
    vi.clearAllMocks();
    as("VIEWER");
    expect(await applyResolvedRows(ok)).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled(); // FINANCE проходит проверку роли действия, но БД (can_import(EMPLOYEES)/RLS) отклоняет — см. SQL D2a
  });
});
