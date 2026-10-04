import { describe, expect, it } from "vitest";
import { loginSchema } from "./schemas";

describe("loginSchema", () => {
  it("принимает корректные данные и обрезает пробелы в email", () => {
    const r = loginSchema.safeParse({ email: "  user@example.com ", password: "secret" });
    expect(r.success).toBe(true);
    expect(r.success && r.data.email).toBe("user@example.com");
  });
  it("сообщает об ошибках по-русски", () => {
    const r = loginSchema.safeParse({ email: "", password: "" });
    expect(r.success).toBe(false);
    const messages = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(messages).toContain("Введите email");
    expect(messages).toContain("Введите пароль");
    const bad = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(bad.success ? [] : bad.error.issues.map((i) => i.message)).toContain("Неверный формат email");
  });
});
