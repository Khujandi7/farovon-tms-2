import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// Оргструктура: справочник подразделений, массовое добавление (предпросмотр → подтверждение), разрешение замечания импорта.
// Mock (e2e/mock-phase3c.mjs) только имитирует RPC; настоящую логику проверяет supabase/tests/phase3c_tests.sql.
const MOCK = "http://127.0.0.1:54399";
const JOB = "dddddddd-dddd-4ddd-8ddd-000000000001";

test.describe("справочник подразделений", () => {
  test("раздел находится по якорю #units, поиск фильтрует список", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/settings/references#units");
    await expect(page.getByRole("heading", { name: "Подразделения и отделы" })).toBeVisible();
    await expect(page.getByTestId("department")).toHaveCount(2);
    await page.getByTestId("org-search").fill("риск");
    await expect(page.getByTestId("department")).toHaveCount(1);
    await expect(page.getByTestId("org-units")).toContainText("Департамент рисков");
  });

  test("?q= подставляется в поиск", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/settings/references?q=Бухгалтерия#units");
    await expect(page.getByTestId("org-search")).toHaveValue("Бухгалтерия");
  });

  test("массовое добавление: предпросмотр показывает дубли, запись только после подтверждения", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/settings/references#units");
    await page.getByTestId("org-bulk-open").click();
    await page.locator("#org-bulk-text").fill("Финансовый департамент\nДепартамент закупок\nДепартамент закупок\tОтдел тендеров\nБухгалтерия;Бухгалтерия");
    const preview = page.getByTestId("org-bulk-preview");
    await expect(preview).toContainText("Будет создано");
    await expect(preview).toContainText("Дубликат");
    // до подтверждения в справочнике ничего не изменилось
    let state = await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json();
    expect(state.bulkCalls).toBe(0);
    await page.getByTestId("org-bulk-confirm").click();
    await expect(page.getByTestId("org-bulk-result")).toContainText("Добавлено");
    state = await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json();
    expect(state.bulkCalls).toBe(1);
    expect(state.units.map((u: { name: string }) => u.name)).toEqual(expect.arrayContaining(["Департамент закупок", "Отдел тендеров"]));
    expect(state.units.filter((u: { name: string }) => u.name === "Департамент закупок")).toHaveLength(1);
  });

  test("ошибки и дубли без новых строк: кнопка подтверждения недоступна", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/settings/references#units");
    await page.getByTestId("org-bulk-open").click();
    await page.locator("#org-bulk-text").fill("Финансовый департамент\nх");
    await expect(page.getByTestId("org-bulk-confirm")).toBeDisabled();
  });
});

test.describe("разрешение замечания импорта «подразделение не найдено»", () => {
  test("создать отдел из замечания и перепроверить строку", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "hr@test.local", baseURL!);
    await page.goto(`/imports/${JOB}`);
    const box = page.getByTestId("import-unit-resolver");
    await expect(box).toContainText("Цех откорма");
    await expect(box.getByRole("link", { name: "Открыть справочник подразделений" })).toHaveAttribute("href", /\/settings\/references\?q=.*#units/);
    await box.getByTestId("import-unit-create").click();
    await expect(page.getByTestId("import-unit-resolver")).toHaveCount(0, { timeout: 15_000 });
    const state = await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json();
    expect(state.row.status).toBe("NEW");
    expect(state.reanalyzed).toBeGreaterThanOrEqual(1);
    expect(state.units.some((u: { name: string; parent_id: number }) => u.name === "Цех откорма" && u.parent_id === 1)).toBe(true);
  });

  test("сопоставить с существующим отделом: закрепляется написание, новое подразделение не создаётся", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/imports/${JOB}`);
    const box = page.getByTestId("import-unit-resolver");
    await box.getByLabel("Существующее подразделение").selectOption({ label: "Бухгалтерия" });
    await box.getByTestId("import-unit-map").click();
    await expect.poll(async () => (await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json()).aliases.length).toBe(1);
    const state = await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json();
    expect(state.units).toHaveLength(3);
  });

  test("DQ: ссылка на справочник ведёт на #units", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: /Подразделения и отделы/ }).first()).toHaveAttribute("href", "/settings/references#units");
  });
});
