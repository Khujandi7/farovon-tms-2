// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc })) }));
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { addOrgUnitAlias, createOrgUnitsBulk } from "./actions";

const as = (role: string) => getSession.mockResolvedValue({ status: "ok", role, userId: "u1" });
const rows = [{ name: "Бройлеры", parent: null }, { name: "Откорм", parent: "Бройлеры" }];

describe("createOrgUnitsBulk — только с подтверждением", () => {
  beforeEach(() => { vi.clearAllMocks(); as("HR"); });

  it("без confirmed:true в БД не уходит (оргструктура не создаётся автоматически)", async () => {
    expect(await createOrgUnitsBulk({ rows })).toMatchObject({ ok: false });
    expect(await createOrgUnitsBulk({ rows, confirmed: false })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("с подтверждением: вызывает RPC и возвращает счётчики, дубли и ошибки", async () => {
    rpc.mockResolvedValue({ data: { created: 1, skipped: 1, errors: [{ index: 3, name: "x", error: "Название короче 2 символов" }], skipped_items: [{ index: 2, name: "Откорм", reason: "Уже есть в справочнике" }] }, error: null });
    const r = await createOrgUnitsBulk({ rows, reason: "Устранение замечаний", confirmed: true });
    expect(rpc).toHaveBeenCalledWith("create_org_units_bulk", { p_rows: rows, p_reason: "Устранение замечаний" });
    expect(r).toMatchObject({ ok: true, data: { created: 1, skipped: 1, errors: [{ index: 3 }], skippedItems: [{ reason: "Уже есть в справочнике" }] } });
  });

  it("лимиты: пустой список и больше 1000 строк отклоняются до БД", async () => {
    expect(await createOrgUnitsBulk({ rows: [], confirmed: true })).toMatchObject({ ok: false });
    expect(await createOrgUnitsBulk({ rows: Array.from({ length: 1001 }, (_, i) => ({ name: `Д${i}x`, parent: null })), confirmed: true })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("роли без права не доходят до БД", async () => {
    for (const role of ["FINANCE", "VIEWER"]) { as(role); expect(await createOrgUnitsBulk({ rows, confirmed: true })).toMatchObject({ ok: false }); }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("ошибка БД (например, нет прав по RLS) возвращается пользователю", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "permission denied" } });
    expect(await createOrgUnitsBulk({ rows, confirmed: true })).toMatchObject({ ok: false });
  });
});

describe("addOrgUnitAlias", () => {
  beforeEach(() => { vi.clearAllMocks(); as("ACADEMY_MANAGER"); });

  it("нужны причина и написание", async () => {
    expect(await addOrgUnitAlias({ id: 5, alias: "Бройлеры", reason: "" })).toMatchObject({ ok: false });
    expect(await addOrgUnitAlias({ id: 5, alias: "x", reason: "причина" })).toMatchObject({ ok: false });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("вызывает RPC по id и сообщает о закреплении", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const r = await addOrgUnitAlias({ id: "5", alias: "Бройлеры", reason: "Из импорта" });
    expect(rpc).toHaveBeenCalledWith("add_org_unit_alias", { p_id: 5, p_alias: "Бройлеры", p_reason: "Из импорта" });
    expect(r).toMatchObject({ ok: true });
  });

  it("конфликт написания (уже закреплено за другим) показывается как есть", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "P0015", message: "Написание «Бройлеры» уже закреплено за другим подразделением" } });
    expect(await addOrgUnitAlias({ id: 5, alias: "Бройлеры", reason: "Из импорта" })).toMatchObject({ ok: false, error: expect.stringContaining("уже закреплено") });
  });
});
