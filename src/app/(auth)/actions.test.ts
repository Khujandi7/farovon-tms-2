// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = { signInWithPassword: vi.fn(), signOut: vi.fn() };
const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth, rpc })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  }),
}));

import { redirect } from "next/navigation";
import { signIn, signOut } from "./actions";
import { NO_ROLE_MESSAGE } from "@/lib/auth/errors";

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

describe("signIn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.signInWithPassword.mockResolvedValue({ error: null });
    auth.signOut.mockResolvedValue({ error: null });
  });

  it("проверяет поля до обращения к Supabase", async () => {
    const state = await signIn({}, form({ email: "bad", password: "" }));
    expect(state.fieldErrors?.email).toBe("Неверный формат email");
    expect(state.fieldErrors?.password).toBe("Введите пароль");
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("неверный пароль: понятное сообщение, email сохраняется", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials", status: 400, message: "x" } });
    const state = await signIn({}, form({ email: "user@example.com", password: "wrong" }));
    expect(state.error).toBe("Неверный email или пароль.");
    expect(state.email).toBe("user@example.com");
  });

  it("нет роли (нет профиля или отключён): сессия закрывается", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const state = await signIn({}, form({ email: "user@example.com", password: "secret" }));
    expect(rpc).toHaveBeenCalledWith("app_role");
    expect(auth.signOut).toHaveBeenCalled();
    expect(state.error).toBe(NO_ROLE_MESSAGE);
  });

  it("успешный вход ведёт на безопасный next", async () => {
    rpc.mockResolvedValue({ data: "HR", error: null });
    await expect(signIn({}, form({ email: "user@example.com", password: "secret", next: "/trainings" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith("/trainings");
  });

  it("внешний next заменяется на дашборд", async () => {
    rpc.mockResolvedValue({ data: "ADMIN", error: null });
    await expect(signIn({}, form({ email: "user@example.com", password: "secret", next: "https://evil.example" }))).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("недоступный сервис авторизации", async () => {
    auth.signInWithPassword.mockRejectedValue(new TypeError("fetch failed"));
    const state = await signIn({}, form({ email: "user@example.com", password: "secret" }));
    expect(state.error).toMatch(/недоступен/);
  });
});

describe("signOut", () => {
  it("закрывает сессию и ведёт на вход", async () => {
    auth.signOut.mockResolvedValue({ error: null });
    await expect(signOut()).rejects.toThrow("NEXT_REDIRECT");
    expect(auth.signOut).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
