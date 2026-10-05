import { describe, expect, it } from "vitest";
import { changePasswordSchema, changeRoleSchema, forgotPasswordSchema, inviteUserSchema, MIN_PASSWORD_LENGTH, setActiveSchema, setPasswordSchema } from "./schemas";

const uuid = "00000000-0000-4000-8000-00000000000a";

describe("inviteUserSchema", () => {
  it("нормализует email и принимает все роли", () => {
    for (const role of ["ADMIN", "ACADEMY_MANAGER", "HR", "FINANCE", "VIEWER"]) {
      const r = inviteUserSchema.safeParse({ email: "  A.B@Example.COM ", fullName: " Иван Иванов ", role });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.email).toBe("a.b@example.com");
        expect(r.data.fullName).toBe("Иван Иванов");
      }
    }
  });
  it("отклоняет неверный email, короткое ФИО и чужую роль", () => {
    expect(inviteUserSchema.safeParse({ email: "x", fullName: "Иван", role: "HR" }).success).toBe(false);
    expect(inviteUserSchema.safeParse({ email: "a@b.co", fullName: "И", role: "HR" }).success).toBe(false);
    expect(inviteUserSchema.safeParse({ email: "a@b.co", fullName: "Иван", role: "OWNER" }).success).toBe(false);
    expect(inviteUserSchema.safeParse({ email: "a@b.co", fullName: "Иван" }).success).toBe(false);
  });
});

describe("прочие схемы", () => {
  it("changeRole / setActive требуют UUID и допустимые значения", () => {
    expect(changeRoleSchema.safeParse({ userId: uuid, role: "HR" }).success).toBe(true);
    expect(changeRoleSchema.safeParse({ userId: "1", role: "HR" }).success).toBe(false);
    expect(setActiveSchema.safeParse({ userId: uuid, active: "yes" }).success).toBe(false);
    expect(setActiveSchema.safeParse({ userId: uuid, active: false }).success).toBe(true);
  });
  it("forgotPassword", () => {
    expect(forgotPasswordSchema.safeParse({ email: "u@farovon.tj" }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: "" }).success).toBe(false);
  });
});

describe("пароль: минимум 12 символов", () => {
  const ok = "a".repeat(MIN_PASSWORD_LENGTH);
  it("setPassword", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(12);
    expect(setPasswordSchema.safeParse({ password: ok, confirm: ok }).success).toBe(true);
    expect(setPasswordSchema.safeParse({ password: "a".repeat(11), confirm: "a".repeat(11) }).success).toBe(false);
    expect(setPasswordSchema.safeParse({ password: ok, confirm: ok + "x" }).success).toBe(false);
    expect(setPasswordSchema.safeParse({ password: "a".repeat(129), confirm: "a".repeat(129) }).success).toBe(false);
  });
  it("changePassword: новый пароль должен отличаться от текущего", () => {
    expect(changePasswordSchema.safeParse({ current: "old-password-1", password: ok, confirm: ok }).success).toBe(true);
    const same = changePasswordSchema.safeParse({ current: ok, password: ok, confirm: ok });
    expect(same.success).toBe(false);
    expect(changePasswordSchema.safeParse({ current: "", password: ok, confirm: ok }).success).toBe(false);
  });
});
