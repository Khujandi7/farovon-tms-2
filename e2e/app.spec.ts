import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe("ADMIN", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
  });

  test("дашборд: KPI из базы, фильтр года, последние обучения", async ({ page }) => {
    await page.goto("/dashboard?year=2026");
    await expect(page.getByRole("heading", { name: "Дашборд" })).toBeVisible();
    await expect(page.getByTestId("kpi-grid")).toBeVisible();
    await expect(page.getByTestId("kpi-actual")).toHaveAttribute("data-state", "value");
    await expect(page.getByTestId("kpi-delivered")).toContainText("3");
    await expect(page.getByTestId("year-filter").getByRole("link", { name: "2026" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("recent-trainings")).toContainText("Тестовый тренинг А");
    await expect(page.getByText("Диаграмма пока недоступна").first()).toBeVisible();
  });

  test("все восемь разделов доступны", async ({ page, isMobile }) => {
    await page.goto("/dashboard");
    if (isMobile) await page.getByTestId("mobile-nav-trigger").click();
    const nav = page.getByRole("navigation", { name: "Основная навигация" }).last();
    for (const label of ["Дашборд", "Обучения", "Сотрудники", "Бюджет", "Обратная связь", "Отчёты", "Качество данных", "Настройки"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
  });

  test("тёмная тема", async ({ page }) => {
    await page.goto("/settings");
    await page.getByTestId("theme-toggle").first().click();
    await page.getByRole("menuitem", { name: "Тёмная" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("HR", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAs(context, "hr@test.local", baseURL!);
  });

  test("финансовые KPI ограничены, а не равны нулю", async ({ page }) => {
    await page.goto("/dashboard");
    for (const id of ["actual", "plan", "variance", "unplanned_actual"]) {
      const card = page.getByTestId(`kpi-${id}`);
      await expect(card).toHaveAttribute("data-state", "restricted");
      await expect(card).toContainText("Нет доступа");
    }
    await expect(page.getByTestId("kpi-delivered")).toContainText("3");
  });

  test("бюджета нет в меню, прямой адрес — отказ", async ({ page, isMobile }) => {
    await page.goto("/dashboard");
    if (isMobile) await page.getByTestId("mobile-nav-trigger").click();
    const nav = page.getByRole("navigation", { name: "Основная навигация" }).last();
    await expect(nav.getByRole("link", { name: "Обучения" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Бюджет" })).toHaveCount(0);
    await page.goto("/budget");
    await expect(page.getByText("Нет доступа к разделу")).toBeVisible();
  });
});

test("пользователь без роли видит экран «не активирована»", async ({ page, context, baseURL }) => {
  await signInAs(context, "norole@test.local", baseURL!);
  await page.goto("/dashboard");
  await expect(page.getByText("Учётная запись не активирована")).toBeVisible();
  await expect(page.getByRole("button", { name: "Выйти" })).toBeVisible();
});

test.describe("адаптивность", () => {
  test("нет горизонтальной прокрутки, меню по размеру экрана", async ({ page, context, baseURL, isMobile }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    for (const path of ["/dashboard", "/trainings", "/settings"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `горизонтальная прокрутка на ${path}`).toBeLessThanOrEqual(1);
    }
    if (isMobile) {
      await expect(page.getByTestId("sidebar")).toBeHidden();
      await page.getByTestId("mobile-nav-trigger").click();
      await page.getByRole("link", { name: "Обучения" }).click();
      await expect(page).toHaveURL(/\/trainings$/);
    } else {
      await expect(page.getByTestId("sidebar")).toBeVisible();
      await expect(page.getByTestId("mobile-nav-trigger")).toBeHidden();
    }
  });

  test("планшет", async ({ browser, baseURL }) => {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 } });
    await signInAs(context, "admin@test.local", baseURL!);
    const page = await context.newPage();
    await page.goto("/dashboard");
    await expect(page.getByTestId("kpi-grid")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await context.close();
  });
});
