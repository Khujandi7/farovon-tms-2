// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const rpc = vi.fn();
const maybeSingle = vi.fn();
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getClaims }, rpc, from })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));

import { getSession } from "./session";

const claims = { data: { claims: { sub: "00000000-0000-0000-0000-00000000000c", email: "hr@example.com" } }, error: null };

describe("getSession: роль берётся из БД (app_role), а не из токена", () => {
  beforeEach(() => vi.clearAllMocks());

  it("без JWT — аноним", async () => {
    getClaims.mockResolvedValue({ data: null, error: null });
    expect(await getSession()).toEqual({ status: "anonymous" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("app_role() = NULL (нет профиля или is_active = false) — нет доступа", async () => {
    getClaims.mockResolvedValue(claims);
    rpc.mockResolvedValue({ data: null, error: null });
    expect((await getSession()).status).toBe("no_access");
  });

  it("роль из app_role(), user_metadata игнорируется", async () => {
    getClaims.mockResolvedValue({ data: { claims: { ...claims.data.claims, user_metadata: { role: "ADMIN" } } }, error: null });
    rpc.mockResolvedValue({ data: "HR", error: null });
    maybeSingle.mockResolvedValue({ data: { full_name: "Тестовый Кадровик" }, error: null });
    const s = await getSession();
    expect(s).toMatchObject({ status: "ok", role: "HR", fullName: "Тестовый Кадровик" });
  });

  it("ошибка БД при определении роли не превращается в доступ", async () => {
    getClaims.mockResolvedValue(claims);
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(getSession()).rejects.toThrow(/роль/);
  });
});
