import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./errors";

describe("authErrorMessage", () => {
  it("неверные данные не раскрывают, существует ли email", () => {
    expect(authErrorMessage({ code: "invalid_credentials", status: 400 })).toBe("Неверный email или пароль.");
    expect(authErrorMessage({ code: "user_not_found", status: 400 })).toBe("Неверный email или пароль.");
  });
  it("лимит попыток и недоступность сервиса", () => {
    expect(authErrorMessage({ code: "over_request_rate_limit", status: 429 })).toMatch(/Слишком много/);
    expect(authErrorMessage({ status: 503 })).toMatch(/недоступен/);
    expect(authErrorMessage({ status: 0 })).toMatch(/недоступен/);
  });
  it("регистрация закрыта", () => {
    expect(authErrorMessage({ code: "signup_disabled", status: 422 })).toMatch(/администратор/);
  });
});
