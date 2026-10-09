// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
let jobRow: { entity: string; status: string; options?: unknown } | null = { entity: "EMPLOYEES", status: "STAGED" };
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: jobRow, error: null }) }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc, from })) }));
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { appendImportRows, beginImportStage, commitImportStep, finishImportStage } from "./actions";

const as = (role: string) => getSession.mockResolvedValue({ status: "ok", role, userId: "u1" });
const JOB = "33333333-3333-4333-8333-333333333333";
const TOKEN = "44444444-4444-4444-8444-444444444444";
const row = (n: number) => ({ row_no: n, raw: { ФИО: `Сотрудник ${n}` }, data: { full_name: `Сотрудник ${n}` } });
const header = { entity: "EMPLOYEES", source: "XLSX", fileName: "employees.xlsx", fileHash: null, mapping: { full_name: 1 }, total: 2646, token: TOKEN };

describe("пакетная загрузка: действия мастера", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    as("HR");
    jobRow = { entity: "EMPLOYEES", status: "STAGED" };
  });

  it("begin передаёт токен и число строк; повтор с тем же токеном — тот же вызов БД (идемпотентность в M23)", async () => {
    rpc.mockResolvedValue({ data: JOB, error: null });
    const r = await beginImportStage(header);
    expect(r).toEqual({ ok: true, data: { jobId: JOB } });
    expect(rpc).toHaveBeenCalledWith("import_stage_begin", expect.objectContaining({ p_entity: "EMPLOYEES", p_total: 2646, p_token: TOKEN }));
  });

  it("begin: больше 5000 строк и роль без права импорта отклоняются до БД", async () => {
    expect(await beginImportStage({ ...header, total: 5001 })).toMatchObject({ ok: false, error: expect.stringContaining("5000") });
    as("FINANCE");
    expect(await beginImportStage(header)).toMatchObject({ ok: false });
    as("VIEWER");
    expect(await beginImportStage(header)).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("append: часть больше 300 строк отклоняется (тело запроса остаётся небольшим)", async () => {
    const r = await appendImportRows({ jobId: JOB, rows: Array.from({ length: 301 }, (_, i) => row(i + 2)) });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("300") });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("append: ответ БД о повторе части передаётся как успех (строки не дублируются)", async () => {
    rpc.mockResolvedValue({ data: { added: 0, skipped: 2, received: 2, expected: 2646 }, error: null });
    expect(await appendImportRows({ jobId: JOB, rows: [row(2), row(3)] })).toEqual({ ok: true, data: { received: 2, expected: 2646 } });
  });

  it("finish: «загружено не всё» — понятная ошибка из БД", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0015", message: "Загружено 2400 из 2646 строк — повторите загрузку" } });
    expect(await finishImportStage({ jobId: JOB })).toMatchObject({ ok: false, error: expect.stringContaining("2400 из 2646") });
  });
});

describe("пакетное применение: commitImportStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    as("HR");
    jobRow = { entity: "EMPLOYEES", status: "STAGED" };
  });

  it("первый шаг требует причину", async () => {
    expect(await commitImportStep({ jobId: JOB, reason: "" })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("продолжение (COMMITTING) работает без причины; размер пакета берётся с прошлого шага в границах 20…150", async () => {
    jobRow = { entity: "EMPLOYEES", status: "COMMITTING" };
    rpc.mockResolvedValue({ data: { status: "COMMITTED", remaining: 0, total: 2646, inserted: 2646, updated: 0, skipped: 0, apply_errors: 0 }, error: null });
    const r = await commitImportStep({ jobId: JOB, reason: null, limit: 9999 });
    expect(r).toMatchObject({ ok: true, data: { done: true, inserted: 2646 } });
    expect(rpc).toHaveBeenCalledWith("import_commit_batch", expect.objectContaining({ p_job: JOB, p_limit: 150 }));
  });

  it("не завершено — done=false и сообщение о прогрессе", async () => {
    rpc.mockResolvedValue({ data: { status: "COMMITTING", remaining: 2526, total: 2646, inserted: 120, updated: 0, skipped: 0, apply_errors: 0 }, error: null });
    const r = await commitImportStep({ jobId: JOB, reason: "Загрузка кадров" });
    expect(r).toMatchObject({ ok: true, data: { done: false } });
    if (r.ok) expect(r.message).toContain("из 2646");
  });

  it("ошибка пакета: импорт не объявлен завершённым, предлагается безопасный повтор", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } });
    const r = await commitImportStep({ jobId: JOB, reason: "Загрузка кадров" });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Продолжить") });
  });

  it("другие сущности применяются прежним import_commit", async () => {
    jobRow = { entity: "PARTICIPANTS", status: "STAGED" };
    rpc.mockResolvedValue({ data: { inserted: 3, updated: 0, skipped: 1 }, error: null });
    const r = await commitImportStep({ jobId: JOB, reason: "Список группы" });
    expect(r).toMatchObject({ ok: true, data: { done: true, inserted: 3 } });
    expect(rpc).toHaveBeenCalledWith("import_commit", expect.anything());
    expect(rpc).not.toHaveBeenCalledWith("import_commit_batch", expect.anything());
  });

  it("роль без права импорта не применяет", async () => {
    as("VIEWER");
    expect(await commitImportStep({ jobId: JOB, reason: "x x x" })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });
});
