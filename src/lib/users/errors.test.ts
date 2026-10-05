import { describe, expect, it } from "vitest";
import { ERR, userErrorMessage } from "./errors";

describe("userErrorMessage: ошибки Supabase → понятные сообщения", () => {
  const cases: [string, Parameters<typeof userErrorMessage>[0], string][] = [
    ["последний ADMIN (P0003)", { code: "P0003", message: "x" }, ERR.lastAdmin],
    ["последний ADMIN по тексту", { message: "Нельзя убрать, понизить или деактивировать последнего активного ADMIN" }, ERR.lastAdmin],
    ["самозащита (P0011)", { code: "P0011", message: "x" }, ERR.self],
    ["RLS", { code: "42501", message: "new row violates row-level security policy" }, ERR.forbidden],
    ["дубликат", { code: "23505", message: "dup" }, ERR.exists],
    ["email_exists", { code: "email_exists", status: 422, message: "x" }, ERR.exists],
    ["лимит писем", { code: "over_email_send_rate_limit", status: 429, message: "x" }, ERR.rateLimit],
    ["HTTP 429", { status: 429, message: "x" }, ERR.rateLimit],
    ["слабый пароль", { code: "weak_password", status: 422, message: "x" }, "Пароль слишком простой или найден в базе утечек. Выберите другой."],
    ["тот же пароль", { code: "same_password", status: 422, message: "x" }, "Новый пароль должен отличаться от текущего."],
    ["устаревшая ссылка", { code: "otp_expired", status: 403, message: "x" }, "Ссылка устарела или уже использована. Запросите новую."],
    ["сервис недоступен", { status: 503, message: "x" }, ERR.unavailable],
    ["сеть", { message: "fetch failed" }, ERR.unavailable],
    ["неизвестная 400", { status: 400, message: "boom" }, ERR.generic],
  ];
  for (const [name, input, expected] of cases) it(name, () => expect(userErrorMessage(input)).toBe(expected));

  it("null/undefined → общее сообщение; технический текст ошибки не раскрывается", () => {
    expect(userErrorMessage(null)).toBe(ERR.generic);
    expect(userErrorMessage({ status: 400, message: "SELECT secret FROM x at line 3" })).not.toMatch(/SELECT/);
  });
});
