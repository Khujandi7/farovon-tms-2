import { describe, expect, it } from "vitest";
import { parseConfirmParams, SET_PASSWORD_PATH } from "./confirm";
import { isPublicPath } from "./routes";

const p = (s: string) => new URLSearchParams(s);

describe("parseConfirmParams", () => {
  it("принимает invite и recovery", () => {
    expect(parseConfirmParams(p("token_hash=abc&type=invite"))).toEqual({ tokenHash: "abc", type: "invite" });
    expect(parseConfirmParams(p("token_hash=abc&type=recovery"))).toEqual({ tokenHash: "abc", type: "recovery" });
  });
  it("отклоняет чужие типы, пустой и слишком длинный токен", () => {
    for (const q of ["token_hash=abc&type=signup", "token_hash=abc&type=email_change", "token_hash=abc&type=magiclink", "token_hash=abc", "type=invite", "token_hash=&type=invite", `token_hash=${"x".repeat(600)}&type=invite`]) {
      expect(parseConfirmParams(p(q))).toBeNull();
    }
  });
  it("после подтверждения всегда /auth/set-password; он закрыт для анонимов, а /auth/confirm открыт", () => {
    expect(SET_PASSWORD_PATH).toBe("/auth/set-password");
    expect(isPublicPath("/auth/confirm")).toBe(true);
    expect(isPublicPath("/forgot-password")).toBe(true);
    expect(isPublicPath("/auth/set-password")).toBe(false);
    expect(isPublicPath("/settings/users")).toBe(false);
  });
});
