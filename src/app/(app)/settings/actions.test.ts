// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
const signInWithPassword = vi.fn();
const updateUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getClaims, signInWithPassword, updateUser } })) }));

import { changeOwnPassword } from "./actions";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};
const NEW = "another-long-password";

describe("changeOwnPassword", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getClaims.mockResolvedValue({ data: { claims: { sub: "u1", email: "u@example.com" } } });
    signInWithPassword.mockResolvedValue({ error: null });
    updateUser.mockResolvedValue({ error: null });
  });
  it("проверяет текущий пароль, затем меняет только пароль", async () => {
    const r = await changeOwnPassword({}, fd({ current: "old-password-123", password: NEW, confirm: NEW }));
    expect(signInWithPassword).toHaveBeenCalledWith({ email: "u@example.com", password: "old-password-123" });
    expect(updateUser).toHaveBeenCalledWith({ password: NEW });
    expect(r.ok).toBe(true);
  });
  it("неверный текущий пароль: пароль не меняется", async () => {
    signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", status: 400, message: "x" } });
    const r = await changeOwnPassword({}, fd({ current: "wrong-password-1", password: NEW, confirm: NEW }));
    expect(r.fieldErrors?.current).toBe("Неверный текущий пароль");
    expect(updateUser).not.toHaveBeenCalled();
  });
  it("минимум 12 символов", async () => {
    const r = await changeOwnPassword({}, fd({ current: "old-password-123", password: "short", confirm: "short" }));
    expect(r.fieldErrors?.password).toMatch(/12/);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
  it("без сессии — просьба войти заново", async () => {
    getClaims.mockResolvedValue({ data: null });
    const r = await changeOwnPassword({}, fd({ current: "old-password-123", password: NEW, confirm: NEW }));
    expect(r.error).toMatch(/Войдите снова/);
  });
});
