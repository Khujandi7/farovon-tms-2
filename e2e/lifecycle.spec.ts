import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

// Phase 3A.2: сквозной жизненный цикл. Mock (e2e/mock-phase3a2.mjs) проверяет интерфейс и права;
// веса оценок, порог анонимности, аудит и RLS проверяют SQL-тесты (supabase/tests/phase3a2_tests.sql).
const T1 = "11111111-1111-4111-8111-111111111111"; // COMPLETED
const T2 = "22222222-2222-4222-8222-222222222222"; // PLANNED
const R1 = "88888888-8888-4888-8888-888888888881";
const TRN1 = "99999999-9999-4999-8999-999999999991";
const NEW_T = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}
const tab = (page: Page, name: string) => page.getByRole("navigation", { name: "Разделы тренинга" }).getByRole("link", { name, exact: true });

test.describe("рабочее пространство обучения", () => {
  test("карточка: все вкладки и воронка участников из БД", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/trainings/${T1}`);
    for (const name of ["Обзор", "Сессии", "Тренеры", "Участники", "Посещаемость", "Расходы", "Обратная связь", "Результаты", "Сертификаты", "Документы", "История"]) {
      await expect(tab(page, name)).toHaveCount(1);
    }
    await expect(page.getByTestId("participant-funnel")).toContainText("Запланировано: 4 / Добавлено: 4 / Присутствовало: 3 / Завершили: 2");
    await noHorizontalScroll(page);
    await tab(page, "Результаты").click();
    await expect(page).toHaveURL(/tab=results/);
    await expect(page.getByTestId("result-row")).toHaveCount(4);
    await expect(page.getByTestId("results-counts")).toContainText("Сертификатов: 1");
    await tab(page, "Сертификаты").click();
    await expect(page.getByText("Сертификатов по этому обучению нет")).toBeVisible();
    await tab(page, "Расходы").click();
    await expect(page.getByTestId("expense-metrics")).toContainText("Остаток");
  });

  test("тренеры: основной, дубликат отклоняется, снятие требует причину", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/trainings/${T1}?tab=trainers`);
    await expect(page.getByText("Тренер не назначен")).toBeVisible();
    await page.getByTestId("trainer-new-mode").click();
    await page.getByLabel("ФИО *").fill("Ахмедов Рустам");
    await page.getByLabel("Организация").fill("ACCA Academy");
    await page.getByLabel("Роль").selectOption("PRIMARY");
    await page.getByTestId("assign-trainer").click();
    await expect(page.getByTestId("trainer-row")).toHaveCount(1);
    await expect(page.getByTestId("trainer-row")).toContainText("Основной");
    // тренер виден в списке обучений
    await page.goto("/trainings");
    await expect(page.getByTestId("training-row-trainers").first()).toContainText("Ахмедов Рустам");
    await page.goto(`/trainings/${T1}?tab=trainers`);
    // тот же тренер второй раз — дубликат
    await page.getByTestId("trainer-new-mode").click();
    await page.getByLabel("ФИО *").fill("ахмедов  рустам");
    await page.getByTestId("assign-trainer").click();
    await expect(page.getByText(/уже есть в справочнике/)).toBeVisible();
    // снятие тренера: причина обязательна
    await page.getByRole("button", { name: /Снять тренера Ахмедов/ }).click();
    await page.getByTestId("remove-trainer-dialog").getByRole("button", { name: "Снять" }).click();
    await expect(page.getByTestId("trainer-row")).toHaveCount(1);
    await page.getByTestId("remove-trainer-dialog").getByLabel(/Причина/).fill("замена тренера");
    await page.getByTestId("remove-trainer-dialog").getByRole("button", { name: "Снять" }).click();
    await expect(page.getByTestId("trainer-row")).toHaveCount(0);
  });

  test("HR и VIEWER видят тренеров, но не управляют ими", async ({ page, context, baseURL }) => {
    for (const email of ["hr@test.local", "viewer@test.local"]) {
      await signInAs(context, email, baseURL!);
      await page.goto(`/trainings/${T1}?tab=trainers`);
      await expect(page.getByTestId("trainers-panel")).toBeVisible();
      await expect(page.getByTestId("trainer-form")).toHaveCount(0);
    }
  });

  test("обратная связь: приглашения, анкета, доля ответов; повторная отправка не дублирует", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/trainings/${T1}?tab=feedback`);
    await expect(page.getByTestId("fb-invited")).toHaveText("0");
    await page.getByTestId("send-feedback").click();
    await expect(page.getByTestId("invitation-row")).toHaveCount(4);
    await expect(page.getByTestId("fb-invited")).toHaveText("4");
    await expect(page.getByTestId("fb-rate")).toHaveText("0%");
    await page.getByTestId("send-feedback").click();
    await expect(page.getByText("Новых приглашений нет")).toBeVisible();
    await expect(page.getByTestId("invitation-row")).toHaveCount(4);
    await page.getByRole("button", { name: "Ввести анкету" }).first().click();
    await page.getByTestId("feedback-dialog").getByLabel("Материалы *").fill("7");
    await page.getByTestId("feedback-dialog").getByLabel("Тренер *").fill("5");
    await page.getByTestId("feedback-dialog").getByLabel("Организация *").fill("3");
    await page.getByTestId("feedback-dialog").getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Оценка от 1 до 5")).toBeVisible();
    await page.getByTestId("feedback-dialog").getByLabel("Материалы *").fill("5");
    await page.getByTestId("feedback-dialog").getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByTestId("fb-answered")).toHaveText("1");
    await expect(page.getByTestId("fb-rate")).toHaveText("25%");
    await expect(page.getByTestId("fb-final")).toHaveText("4,4");
    await noHorizontalScroll(page);
  });

  test("обратная связь: до начала обучения запрос отклоняется; HR не отправляет, оценки скрыты", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/trainings/${T2}?tab=feedback`);
    await page.getByTestId("send-feedback").click();
    await expect(page.getByText(/можно запросить после начала обучения/)).toBeVisible();
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto(`/trainings/${T1}?tab=feedback`);
    await expect(page.getByTestId("send-feedback")).toHaveCount(0);
    await expect(page.getByTestId("fb-final")).toHaveText("Скрыта");
  });
});

test.describe("заявка → обучение", () => {
  test("«Создать обучение» переносит данные заявки и сохраняет связь в обе стороны", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/trainings/requests/${R1}`);
    await expect(page.getByTestId("request-lifecycle")).toBeVisible();
    await page.getByLabel("Приоритет").selectOption("HIGH");
    await page.getByLabel("Ожидаемый результат").fill("Сертификат МСФО");
    await page.getByRole("button", { name: "Сохранить" }).first().click();
    await page.getByTestId("create-training-from-request").click();
    await page.getByTestId("from-request-dialog").getByLabel("Начало *").fill("2026-06-01");
    await page.getByTestId("from-request-dialog").getByLabel("Часы *").fill("12");
    await page.getByTestId("from-request-submit").click();
    await expect(page).toHaveURL(new RegExp(`/trainings/${NEW_T}`));
    await expect(page.getByRole("heading", { name: "Курс по МСФО" })).toBeVisible();
    await expect(page.getByText("REQ-2026-001").first()).toBeVisible(); // обучение показывает исходную заявку
    await page.goto(`/trainings/requests/${R1}`);
    await expect(page.getByTestId("linked-training")).toContainText("TR-2026-77"); // заявка показывает созданное обучение
  });

  test("HR не видит кнопку создания обучения", async ({ page, context, baseURL }) => {
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto(`/trainings/requests/${R1}`);
    await expect(page.getByTestId("create-training-from-request")).toHaveCount(0);
  });
});

test.describe("тренеры, поиск, отчёты и дашборд", () => {
  test("справочник и карточка тренера", async ({ page, context, baseURL }) => {
    await signInAs(context, "viewer@test.local", baseURL!);
    await page.goto("/trainers");
    await expect(page.getByTestId("trainer-list-row")).toContainText("Каримова Нигора");
    await page.goto(`/trainers/${TRN1}`);
    await expect(page.getByRole("heading", { name: "Каримова Нигора" })).toBeVisible();
    await expect(page.getByTestId("breadcrumbs")).toContainText("Тренеры");
  });

  test("поиск находит тренера", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/dashboard");
    await page.getByTestId("search-trigger").click();
    await page.getByTestId("search-input").fill("Каримова");
    await expect(page.getByTestId("search-result").first()).toContainText("Каримова");
    await expect(page.getByRole("group", { name: "Тренеры" })).toBeVisible();
  });

  test("отчёты и дашборд показывают одни и те же KPI из БД; HR без денег", async ({ page, context, baseURL }) => {
    await signInAs(context, "finance@test.local", baseURL!);
    await page.goto("/reports");
    await expect(page.getByTestId("lc-delivered")).toContainText("1");
    await expect(page.getByTestId("lc-participants")).toContainText("4");
    await expect(page.getByTestId("lc-cost-participant")).toContainText("375");
    await expect(page.getByTestId("department-row")).toContainText("Финансовый департамент");
    await expect(page.getByTestId("trainer-report-row")).toContainText("Каримова Нигора");
    await noHorizontalScroll(page);
    await page.goto("/dashboard");
    await expect(page.getByTestId("lc-participants")).toContainText("4");
    await expect(page.getByTestId("lc-cost-participant")).toContainText("375");

    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto("/reports");
    await expect(page.getByTestId("lc-cost-participant")).toContainText("Нет доступа");
    await expect(page.getByTestId("lc-participants")).toContainText("4");
    await expect(page.getByTestId("trainer-report-row")).toContainText("скрыта");
  });

  test("страница обратной связи ведёт в обучение", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/trainings/${T1}?tab=feedback`);
    await page.getByTestId("send-feedback").click();
    await expect(page.getByTestId("invitation-row")).toHaveCount(4);
    await page.goto("/feedback?year=2026");
    await expect(page.getByTestId("feedback-row")).toContainText("Приглашено 4");
    await page.getByTestId("feedback-row").getByRole("link").click();
    await expect(page).toHaveURL(/tab=feedback/);
  });
});
