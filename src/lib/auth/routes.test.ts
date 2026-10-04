import { describe, expect, it } from "vitest";
import { isPublicPath, loginRedirectPath, safeNextPath } from "./routes";

describe("isPublicPath", () => {
  it("открыты только вход и страница ошибки авторизации", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/error")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
    expect(isPublicPath("/budget")).toBe(false);
  });
});

describe("safeNextPath (защита от открытого редиректа)", () => {
  it("пропускает внутренние пути", () => {
    expect(safeNextPath("/trainings")).toBe("/trainings");
    expect(safeNextPath("/dashboard?year=2025")).toBe("/dashboard?year=2025");
  });
  it("отбрасывает внешние и подозрительные адреса", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "/x\u0000y"]) {
      expect(safeNextPath(bad)).toBe("/dashboard");
    }
  });
  it("не возвращает на страницу входа и использует запасной путь", () => {
    expect(safeNextPath("/login")).toBe("/dashboard");
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath(null, "/x")).toBe("/x");
  });
});

describe("loginRedirectPath", () => {
  it("корень не передаётся в next", () => {
    expect(loginRedirectPath("/")).toBeNull();
    expect(loginRedirectPath("/budget?year=2025")).toBe("/budget?year=2025");
    expect(loginRedirectPath("//evil")).toBeNull();
  });
});
