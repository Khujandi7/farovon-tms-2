// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({ createStatelessClient: () => ({ auth: { resetPasswordForEmail } }) }));
vi.mock("@/lib/env.server", () => ({ getSiteUrl: () => "https://tms.example" }));

import { requestPasswordReset } from "./actions";
import { ERR, FORGOT_PASSWORD_NOTICE } from "@/lib/users/errors";

const fd = (email: string) => {
  const f = new FormData();
  f.set("email", email);
  return f;
};

describe("requestPasswordReset (самообслуживание)", () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset();
    resetPasswordForEmail.mockResolvedValue({ error: null });
  });
  it("неверный email не уходит в Supabase", async () => {
    const r = await requestPasswordReset({}, fd("bad"));
    expect(r.fieldErrors?.email).toBe("Неверный формат email");
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("отправляет письмо с redirect на /auth/confirm", async () => {
    const r = await requestPasswordReset({}, fd("User@Example.com"));
    expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", { redirectTo: "https://tms.example/auth/confirm" });
    expect(r).toEqual({ ok: true, message: FORGOT_PASSWORD_NOTICE });
  });
  it("не раскрывает, есть ли такой email: ошибки 'не найден' дают тот же ответ", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: "user_not_found", status: 400, message: "x" } });
    expect(await requestPasswordReset({}, fd("nobody@example.com"))).toEqual({ ok: true, message: FORGOT_PASSWORD_NOTICE });
  });
  it("лимит писем и недоступность сервиса показываются", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { code: "over_email_send_rate_limit", status: 429, message: "x" } });
    expect((await requestPasswordReset({}, fd("u@example.com"))).error).toBe(ERR.rateLimit);
    resetPasswordForEmail.mockRejectedValue(new TypeError("fetch failed"));
    expect((await requestPasswordReset({}, fd("u@example.com"))).error).toBe(ERR.unavailable);
  });
});
