// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getClaims = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth: { getClaims } })),
}));

import { createServerClient } from "@supabase/ssr";
import { hasAuthCookie, updateSession } from "./proxy";

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";

const req = (path: string, cookie?: string) =>
  new NextRequest(new URL(path, "http://localhost:3000"), cookie ? { headers: { cookie } } : undefined);
const AUTH = "sb-test-project-auth-token=base64-xyz";

describe("proxy: защита маршрутов", () => {
  beforeEach(() => {
    getClaims.mockReset();
    vi.mocked(createServerClient).mockClear();
  });

  it("аноним на закрытой странице уходит на /login с безопасным next", async () => {
    const res = await updateSession(req("/budget?year=2025"));
    expect(res.status).toBe(307);
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/budget?year=2025");
    // без cookie сессии сеть не трогаем
    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("аноним на корне уходит на /login без next", async () => {
    const res = await updateSession(req("/"));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.has("next")).toBe(false);
  });

  it("страница входа открыта для анонима", async () => {
    const res = await updateSession(req("/login"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("недействительный токен = аноним", async () => {
    getClaims.mockResolvedValue({ data: null, error: new Error("invalid JWT") });
    const res = await updateSession(req("/dashboard", AUTH));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/login");
  });

  it("вошедший пользователь проходит на закрытую страницу", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } }, error: null });
    const res = await updateSession(req("/trainings", AUTH));
    expect(res.headers.get("location")).toBeNull();
  });

  it("вошедшего пользователя со страницы входа отправляем на дашборд", async () => {
    getClaims.mockResolvedValue({ data: { claims: { sub: "00000000-0000-0000-0000-000000000001" } }, error: null });
    const res = await updateSession(req("/login", AUTH));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/dashboard");
  });

  it("распознаёт cookie сессии, в том числе разбитую на части", () => {
    expect(hasAuthCookie(req("/", "sb-abc-auth-token.0=x; sb-abc-auth-token.1=y"))).toBe(true);
    expect(hasAuthCookie(req("/", "other=1"))).toBe(false);
  });
});
