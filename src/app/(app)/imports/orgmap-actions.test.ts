// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { previewOrgMap, reanalyzeOrgMapBatch, saveOrgMap, scanOrgMap } from "./orgmap-actions";

const JOB = "dddddddd-dddd-4ddd-8ddd-000000000004";
const as = (role: string) => getSession.mockResolvedValue({ status: "ok", role, userId: "u1" });
const item = { kind: "UNIT" as const, srcName: "Кадры", scope: "P:12", action: "MAP" as const, orgUnitId: 77 };

// M27: логику (контекст, дубли, идемпотентность, права) проверяет SQL-набор hotfix4_orgmap_tests.sql; здесь — граница серверных действий.
describe("scanOrgMap", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });
  it("приводит ответ БД к модели: причины, кандидаты с путями, разбивка по кодам", async () => {
    rpc.mockResolvedValue({ data: { job_status: "COMMITTED", groups: 2, mapped_groups: 1, offset: 0, limit: 300, rows_with_unit_issue: 5, duplicates: 4,
      by_cause: { OTHER_PARENT: { groups: 1, rows: 3 }, "НЕИЗВЕСТНО": { groups: 9, rows: 9 } },
      review_breakdown: [{ code: "UNIT_UNKNOWN", rows: 4, with_unit_issue: 4 }, { code: "EMPLOYEE_AMBIGUOUS", rows: 1, with_unit_issue: 1 }],
      protected: { applied: 151, skipped_by_decision: 2 },
      groups_list: [{ kind: "UNIT", src_name: "Охрана труда", src_norm: "охрана труда", scope: "P:2", scope_label: "Управление Б", rows: 3, sample_rows: [8, 9], cause: "OTHER_PARENT", action: "DECIDE", mapped_to: null, resolved_to: null,
        candidates: [{ id: 5, level: "UNIT", name: "Охрана труда", parent_id: 1, path: "Управление А › Охрана труда", kind: "EXACT", allowed: false, why: "Относится к другому департаменту" }] }] }, error: null });
    const r = await scanOrgMap({ jobId: JOB });
    expect(rpc).toHaveBeenCalledWith("import_orgmap_scan", { p_job: JOB, p_limit: 300, p_offset: 0 });
    expect(r).toMatchObject({ ok: true, data: { groups: 2, protectedApplied: 151, duplicates: 4, byCause: [{ cause: "OTHER_PARENT", groups: 1, rows: 3 }],
      reviewBreakdown: [{ code: "UNIT_UNKNOWN" }, { code: "EMPLOYEE_AMBIGUOUS", withUnitIssue: 1 }],
      list: [{ kind: "UNIT", cause: "OTHER_PARENT", recommended: "DECIDE", scopeLabel: "Управление Б", candidates: [{ path: "Управление А › Охрана труда", allowed: false, why: "Относится к другому департаменту" }] }] } });
  });
  it("неверные аргументы и роли без права не доходят до БД", async () => {
    expect(await scanOrgMap({ jobId: "x" })).toMatchObject({ ok: false });
    expect(await scanOrgMap({ jobId: JOB, limit: 5000 })).toMatchObject({ ok: false });
    as("VIEWER");
    expect(await scanOrgMap({ jobId: JOB })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("previewOrgMap — только dry-run", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });
  it("передаёт p_dry = true и пункты в формате БД, не передаёт причину", async () => {
    rpc.mockResolvedValue({ data: { dry: true, ok: 1, failed: 0, mapped: 1, aliases: 0, created: 0, cleared: 0, rows_affected: 3, items: [{ index: 1, kind: "UNIT", src_name: "Кадры", scope: "P:12", action: "MAP", ok: true, changed: true, rows: 3, alias_added: false, created_id: null }] }, error: null });
    const r = await previewOrgMap({ jobId: JOB, items: [item] });
    expect(rpc).toHaveBeenCalledWith("import_orgmap_apply", { p_job: JOB, p_items: [{ kind: "UNIT", src_name: "Кадры", scope: "P:12", action: "MAP", org_unit_id: 77 }], p_dry: true });
    expect(r).toMatchObject({ ok: true, data: { dry: true, ok: 1, rowsAffected: 3, items: [{ ok: true, rows: 3, error: null }] } });
  });
  it("пустой список, чужой контекст и слишком много пунктов отклоняются до БД", async () => {
    expect(await previewOrgMap({ jobId: JOB, items: [] })).toMatchObject({ ok: false });
    expect(await previewOrgMap({ jobId: JOB, items: [{ ...item, scope: "X:1" }] })).toMatchObject({ ok: false });
    expect(await previewOrgMap({ jobId: JOB, items: Array.from({ length: 201 }, () => item) })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("saveOrgMap — только с подтверждением и причиной", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });
  const ok = { jobId: JOB, items: [item], reason: "Сверка с кадровой службой", confirmed: true };
  it("без confirmed:true или без причины в БД не уходит", async () => {
    expect(await saveOrgMap({ ...ok, confirmed: false })).toMatchObject({ ok: false });
    expect(await saveOrgMap({ ...ok, confirmed: undefined })).toMatchObject({ ok: false });
    expect(await saveOrgMap({ ...ok, reason: "" })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("с подтверждением вызывает import_orgmap_apply с p_dry = false и причиной; создание и подтверждение омонима передаются", async () => {
    rpc.mockResolvedValue({ data: { dry: false, ok: 2, failed: 0, mapped: 1, aliases: 0, created: 1, cleared: 0, rows_affected: 5, items: [] }, error: null });
    const r = await saveOrgMap({ ...ok, items: [item, { kind: "UNIT", srcName: "Охрана труда", scope: "P:2", action: "CREATE", confirmHomonym: true }] });
    expect(rpc).toHaveBeenCalledWith("import_orgmap_apply", { p_job: JOB, p_dry: false, p_reason: ok.reason, p_items: [
      { kind: "UNIT", src_name: "Кадры", scope: "P:12", action: "MAP", org_unit_id: 77 },
      { kind: "UNIT", src_name: "Охрана труда", scope: "P:2", action: "CREATE", confirm_homonym: true }] });
    expect(r).toMatchObject({ ok: true, data: { dry: false, created: 1, mapped: 1, rowsAffected: 5 } });
  });
  it("ошибка БД показывается как есть; роли без права не доходят до БД", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0015", message: "Импорт уже завершён" } });
    expect(await saveOrgMap(ok)).toMatchObject({ ok: false });
    vi.clearAllMocks(); as("VIEWER");
    expect(await saveOrgMap(ok)).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("reanalyzeOrgMapBatch", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });
  it("вызывает import_orgmap_reanalyze_batch с курсором", async () => {
    rpc.mockResolvedValue({ data: { processed: 200, resolved: 150, unresolved: 50, errors: 0, remaining: 400, next_after: 999, done: false, first_error: null }, error: null });
    const r = await reanalyzeOrgMapBatch({ jobId: JOB, after: 5, limit: 200 });
    expect(rpc).toHaveBeenCalledWith("import_orgmap_reanalyze_batch", { p_job: JOB, p_limit: 200, p_after: 5 });
    expect(r).toMatchObject({ ok: true, data: { processed: 200, resolved: 150, nextAfter: 999, done: false } });
    expect(await reanalyzeOrgMapBatch({ jobId: JOB, limit: 501 })).toMatchObject({ ok: false });
  });
});
