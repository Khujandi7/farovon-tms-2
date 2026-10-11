// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { applyImportDecisions, getDecisionsSummary, resolveImportRowsBulk } from "./decisions-actions";

const JOB = "dddddddd-dddd-4ddd-8ddd-000000000007";
const as = (role: string) => getSession.mockResolvedValue({ status: "ok", role, userId: "u1" });

// Логику (права, дубли, идемпотентность, курсор) проверяет SQL-набор hotfix7_resolve_committed_tests.sql; здесь — граница серверных действий.
describe("решения по сотрудникам после применения (M30)", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });

  it("сводка приводится к модели", async () => {
    rpc.mockResolvedValue({ data: { job_status: "COMMITTED", total: 39, undecided: 30, to_create: 5, to_match: 3, to_skip: 1, errors: 0 }, error: null });
    const r = await getDecisionsSummary({ jobId: JOB });
    expect(rpc).toHaveBeenCalledWith("import_decisions_summary", { p_job: JOB });
    expect(r).toMatchObject({ ok: true, data: { total: 39, undecided: 30, toCreate: 5, toMatch: 3, toSkip: 1, errors: 0 } });
  });

  it("массовое решение: передаёт задание, решение и строки; «сопоставить» массово невозможно", async () => {
    rpc.mockResolvedValue({ data: { changed: 39, remaining: 0, done: true }, error: null });
    const r = await resolveImportRowsBulk({ jobId: JOB, decision: "APPLY" });
    expect(rpc).toHaveBeenCalledWith("import_resolve_rows_bulk", { p_job: JOB, p_decision: "APPLY", p_rows: undefined, p_limit: 300 });
    expect(r).toMatchObject({ ok: true, data: { changed: 39, remaining: 0, done: true } });
    expect(await resolveImportRowsBulk({ jobId: JOB, decision: "MATCH" })).toMatchObject({ ok: false });
    expect(await resolveImportRowsBulk({ jobId: JOB, decision: "SKIP", rowIds: Array.from({ length: 501 }, (_, i) => i + 1) })).toMatchObject({ ok: false });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("применение требует подтверждения и причины, размер пакета ограничен", async () => {
    expect(await applyImportDecisions({ jobId: JOB, reason: "Решения по спорным сотрудникам" })).toMatchObject({ ok: false });
    expect(await applyImportDecisions({ jobId: JOB, reason: "", confirmed: true })).toMatchObject({ ok: false });
    expect(await applyImportDecisions({ jobId: JOB, reason: "Решения по спорным сотрудникам", confirmed: true, limit: 101 })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
    rpc.mockResolvedValue({ data: { processed: 3, created: 2, updated: 1, errors: 0, remaining: 0, next_after: 77, done: true }, error: null });
    const r = await applyImportDecisions({ jobId: JOB, reason: "Решения по спорным сотрудникам", confirmed: true });
    expect(rpc).toHaveBeenCalledWith("import_apply_decided_batch", { p_job: JOB, p_limit: 40, p_after: 0, p_reason: "Решения по спорным сотрудникам" });
    expect(r).toMatchObject({ ok: true, data: { created: 2, updated: 1, nextAfter: 77, done: true } });
  });

  it("неверный id задания и роль без права не доходят до БД", async () => {
    expect(await getDecisionsSummary({ jobId: "x" })).toMatchObject({ ok: false });
    as("VIEWER");
    expect(await getDecisionsSummary({ jobId: JOB })).toMatchObject({ ok: false });
    expect(await resolveImportRowsBulk({ jobId: JOB, decision: "SKIP" })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});
