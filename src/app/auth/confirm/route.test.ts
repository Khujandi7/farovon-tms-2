// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { verifyOtp } })) }));

import { GET } from "./route";

const call = (qs: string) => GET(new NextRequest(`http://localhost:3000/auth/confirm?${qs}`));

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    verifyOtp.mockResolvedValue({ error: null });
  });
  it("invite: verifyOtp(token_hash, type) → /auth/set-password", async () => {
    const res = await call("token_hash=abc&type=invite");
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "abc", type: "invite" });
    expect(res.headers.get("location")).toBe("/auth/set-password");
  });
  it("recovery → /auth/set-password; параметр next игнорируется", async () => {
    const res = await call("token_hash=abc&type=recovery&next=https://evil.example");
    expect(res.headers.get("location")).toBe("/auth/set-password");
  });
  it("просроченный/использованный токен → /auth/error", async () => {
    verifyOtp.mockResolvedValue({ error: { code: "otp_expired", status: 403, message: "x" } });
    const res = await call("token_hash=abc&type=invite");
    expect(res.headers.get("location")).toBe("/auth/error");
  });
  it("неверные параметры: verifyOtp не вызывается", async () => {
    for (const qs of ["", "type=invite", "token_hash=a&type=signup"]) {
      const res = await call(qs);
      expect(res.headers.get("location")).toBe("/auth/error");
    }
    expect(verifyOtp).not.toHaveBeenCalled();
  });
  it("исключение при обращении к Auth → /auth/error", async () => {
    verifyOtp.mockRejectedValue(new TypeError("fetch failed"));
    const res = await call("token_hash=abc&type=invite");
    expect(res.headers.get("location")).toBe("/auth/error");
  });
});
