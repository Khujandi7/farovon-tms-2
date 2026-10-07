import { expect, test, type Page } from "@playwright/test";
import { MOCK_URL, signInAs } from "./helpers";

// Phase 3A.1: досье сотрудника, экзамены, сертификаты, финансирование, портал заявок, уведомления, поиск, импорт, экспорт.
const E1 = "44444444-4444-4444-8444-444444444444";
const TOKEN = "ab".repeat(24);

test.beforeEach(async ({ request }) => {
  await request.get(`${MOCK_URL}/__mock/reset`);
});

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("досье сотрудника", () => {
  test("ADMIN: профиль, KPI, все вкладки; экзамены — две попытки CAP без перезаписи", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/employees/${E1}`);
    await expect(page.getByRole("heading", { name: "Убайдуллоев Азам" })).toBeVisible();
    await expect(page.getByTestId("breadcrumbs")).toContainText("Сотрудники");
    await expect(page.getByTestId("kpi-exams")).toHaveText("1 / 2");
    await expect(page.getByTestId("kpi-company")).toBeVisible();
    for (const id of ["overview", "history", "events", "exams", "certificates", "individual", "contracts", "documents", "skills", "plan", "costs", "timeline", "audit"]) {
      await expect(page.getByTestId(`tab-${id}`)).toHaveCount(1);
    }
    await page.getByTestId("tab-exams").click();
    await expect(page).toHaveURL(/tab=exams/);
    await expect(page.getByTestId("exams-tab")).toBeVisible();
    await expect(page.getByTestId("exams-tab")).toContainText("CAP");
    await expect(page.getByTestId("exams-tab")).toContainText(/Не сдан|FAILED/i);
    await expect(page.getByTestId("exams-tab")).toContainText(/Сдан|PASSED/i);

    await page.getByTestId("tab-timeline").click();
    await expect(page.getByTestId("timeline-item")).toHaveCount(3);
    await page.goBack();
    await expect(page).toHaveURL(/tab=exams/);
  });

  test("HR: нет вкладок договоров и затрат, KPI без денег; прямой адрес вкладки затрат открывает обзор", async ({ page, context, baseURL }) => {
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto(`/employees/${E1}`);
    await expect(page.getByTestId("tab-contracts")).toHaveCount(0);
    await expect(page.getByTestId("tab-costs")).toHaveCount(0);
    await expect(page.getByTestId("kpi-company")).toHaveCount(0);
    await page.goto(`/employees/${E1}?tab=costs`);
    await expect(page.getByTestId("dossier-overview")).toBeVisible();
  });

  test("FINANCE: вкладка затрат показывает суммы", async ({ page, context, baseURL }) => {
    await signInAs(context, "finance@test.local", baseURL!);
    await page.goto(`/employees/${E1}?tab=costs`);
    await expect(page.getByTestId("costs-tab")).toBeVisible();
  });

  test("мобильная вёрстка досье без горизонтальной прокрутки", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/employees/${E1}`);
    await expect(page.getByRole("heading", { name: "Убайдуллоев Азам" })).toBeVisible();
    await noHorizontalScroll(page);
  });
});

test.describe("разделы Phase 3A.1 и права", () => {
  test("экзамены и сертификаты открываются, финансирование — только для ответственных за деньги", async ({ page, context, baseURL }) => {
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto("/exams");
    await expect(page.getByRole("heading", { name: "Экзамены" })).toBeVisible();
    await page.goto("/certificates");
    await expect(page.getByText("CAP Certificate").filter({ visible: true }).first()).toBeVisible();
    await page.goto("/funding");
    await expect(page.getByText(/недостаточно прав|нет доступа/i).first()).toBeVisible();
  });

  test("FINANCE видит реестр соглашений", async ({ page, context, baseURL }) => {
    await signInAs(context, "finance@test.local", baseURL!);
    await page.goto("/funding");
    await expect(page.getByText("AG-2026-1").filter({ visible: true }).first()).toBeVisible();
  });

  test("центр импорта: плитки сущностей и шаблон .xlsx", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/imports");
    for (const slug of ["employees", "participants", "exams", "certificates"]) await expect(page.getByTestId(`import-tile-${slug}`)).toBeVisible();
    const resp = await page.request.get("/imports/templates/employees");
    expect(resp.status()).toBe(200);
    expect(resp.headers()["content-type"]).toContain("spreadsheetml");
  });

  test("экспорт: аноним — отказ, вошедший получает CSV с BOM", async ({ page, context, baseURL, playwright }) => {
    const anon = await playwright.request.newContext({ baseURL });
    const denied = await anon.get("/export/employees?format=csv", { maxRedirects: 0 });
    expect([302, 303, 307, 401]).toContain(denied.status());
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto("/dashboard");
    const resp = await page.request.get("/export/employees?format=csv");
    expect(resp.status()).toBe(200);
    const text = await resp.text();
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const agreements = await page.request.get("/export/agreements?format=csv");
    expect(agreements.status()).toBe(403);
  });

  test("дашборд: «Требует внимания» с кликабельными пунктами; уведомления", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/dashboard");
    await expect(page.getByTestId("attention-panel")).toBeVisible();
    await expect(page.getByTestId("attention-CERT_EXPIRING").getByRole("link")).toHaveAttribute("href", /certificates/);
    await page.goto("/notifications");
    await expect(page.getByText("Сертификат истекает через 30 дней").first()).toBeVisible();
    await noHorizontalScroll(page);
  });

  test("глобальный поиск Ctrl+K находит CAP", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/dashboard");
    await page.getByTestId("search-trigger").click();
    await page.getByTestId("search-input").fill("CAP");
    await expect(page.getByTestId("search-result").first()).toBeVisible();
    await expect(page.getByTestId("search-dialog")).toContainText("CAP Certificate");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("search-dialog")).toHaveCount(0);
  });

  test("ссылки заявок: ADMIN управляет, HR — отказ", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/settings/request-links");
    await expect(page.getByText("Финансовый департамент").first()).toBeVisible();
    await context.clearCookies();
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto("/settings/request-links");
    await expect(page.getByText(/недостаточно прав|нет доступа/i).first()).toBeVisible();
  });
});

test.describe("публичный портал заявок (без входа)", () => {
  test("ссылка подразделения: подразделение зафиксировано, заявка получает номер", async ({ page, request }) => {
    await page.goto(`/request/${TOKEN}`);
    await expect(page.getByTestId("fixed-department")).toHaveText(/Финансовый департамент/);
    await page.getByLabel("ФИО инициатора").fill("Каримов Фаррух");
    await page.getByLabel("Тема обучения").fill("Excel для финансистов");
    await page.getByLabel("Цель обучения").fill("Ускорить подготовку отчётности");
    await page.getByLabel("Количество участников").fill("12");
    await page.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-code")).toHaveText(/^REQ-2026-\d{3,}$/);
    const sent = await (await request.get(`${MOCK_URL}/__mock/portal`)).json();
    expect(sent.at(-1).p_token).toBe(TOKEN);
    await noHorizontalScroll(page);
  });

  test("неверная ссылка — форма не открывается; общая форма — выбор подразделения", async ({ page }) => {
    await page.goto(`/request/${"cd".repeat(24)}`);
    await expect(page.getByTestId("request-closed")).toBeVisible();
    await page.goto("/request/not-a-token");
    await expect(page.getByTestId("request-closed")).toBeVisible();
    await page.goto("/request");
    await expect(page.getByTestId("request-form")).toBeVisible();
    await expect(page.getByLabel("Подразделение")).toBeVisible();
  });

  test("honeypot: бот получает «успех», заявка не уходит", async ({ page, request }) => {
    await page.goto("/request");
    await page.locator("#website").fill("http://spam", { force: true });
    await page.getByLabel("ФИО инициатора").fill("Бот Ботов");
    await page.getByLabel("Подразделение").selectOption({ label: "Финансовый департамент" });
    await page.getByLabel("Тема обучения").fill("Спам спам");
    await page.getByLabel("Цель обучения").fill("Спам спам спам");
    await page.getByLabel("Количество участников").fill("3");
    await page.getByTestId("request-submit").click();
    await expect(page.getByTestId("request-success")).toBeVisible();
    const sent = await (await request.get(`${MOCK_URL}/__mock/portal`)).json();
    expect(sent.every((s: { p?: { requester_name?: string } }) => s.p?.requester_name !== "Бот Ботов")).toBe(true);
  });
});
