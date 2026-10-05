// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getClaims, updateUser, signOut }, rpc })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((u: string) => { throw Object.assign(new Error("NEXT_REDIRECT"), { url: u }); }) }));

import { redirect } from "next/navigation";
import { setPassword } from "./actions";
import { NO_ROLE_MESSAGE } from "@/lib/auth/errors";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const GOOD = "correct-horse-battery";

describe("setPassword (после /auth/confirm)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1" } } });
    updateUser.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: "HR", error: null });
  });
  it("короткий пароль и несовпадение не доходят до Supabase", async () => {
    const short = await setPassword({}, fd({ password: "short", confirm: "short" }));
    expect(short.fieldErrors?.password).toMatch(/12/);
    const diff = await setPassword({}, fd({ password: GOOD, confirm: GOOD + "x" }));
    expect(diff.fieldErrors?.confirm).toBe("Пароли не совпадают");
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("без сессии пароль не меняется", async () => {
    getClaims.mockResolvedValue({ data: null });
    const r = await setPassword({}, fd({ password: GOOD, confirm: GOOD }));
    expect(r.error).toMatch(/Сессия не найдена/);
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("успех: updateUser только с паролем (роль/is_active не передаются) → /dashboard", async () => {
    await expect(setPassword({}, fd({ password: GOOD, confirm: GOOD }))).rejects.toThrow("NEXT_REDIRECT");
    expect(updateUser).toHaveBeenCalledWith({ password: GOOD });
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });
  it("слабый/утёкший пароль: понятное сообщение", async () => {
    updateUser.mockResolvedValue({ error: { code: "weak_password", status: 422, message: "x" } });
    const r = await setPassword({}, fd({ password: GOOD, confirm: GOOD }));
    expect(r.error).toMatch(/слишком простой/);
  });
  it("нет активной роли (деактивирован): сессия закрывается", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const r = await setPassword({}, fd({ password: GOOD, confirm: GOOD }));
    expect(signOut).toHaveBeenCalled();
    expect(r.error).toBe(NO_ROLE_MESSAGE);
  });
});
