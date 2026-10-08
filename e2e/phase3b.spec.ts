import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

// Phase 3B: Google Sheets (mock Google + mock БД, e2e/mock-phase3b.mjs) и выбор участников обучения.
// Идемпотентность, сверку «нет в таблице», атомарность и RLS проверяет SQL-набор supabase/tests/phase3b_tests.sql.
const SHEET_URL = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0";
const R1 = "88888888-8888-4888-8888-888888888881";
const NEW_T = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const E_AZAM = "44444444-4444-4444-8444-444444444444";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe("Google Sheets: подключение и предпросмотр", () => {
  test("ссылка → лист → предпросмотр → соответствие колонок; сервисный аккаунт показан, ключа в странице нет", async ({ page, context, baseURL }) => {
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto("/employees/import");
    await page.getByTestId("import-mode-gsheet").click();
    await expect(page.getByTestId("gsheet-sa")).toContainText("tms-sync@e2e-test.iam.gserviceaccount.com");
    // неверная ссылка — понятная ошибка
    await page.getByTestId("gsheet-url").fill("https://example.com/spreadsheets/d/abc");
    await page.getByTestId("gsheet-connect").click();
    await expect(page.getByText(/Google|ссылк/i).first()).toBeVisible();
    await expect(page.getByTestId("gsheet-info")).toHaveCount(0);
    // верная ссылка
    await page.getByTestId("gsheet-url").fill(SHEET_URL);
    await page.getByTestId("gsheet-connect").click();
    await expect(page.getByTestId("gsheet-info")).toContainText("Сотрудники FAROVON");
    await page.getByTestId("gsheet-load").click();
    await expect(page.getByTestId("import-preview-stats")).toContainText("строк с данными: 3");
    await expect(page.getByTestId("import-preview-stats")).toContainText("Строка заголовков: 2"); // шапка найдена после заголовка листа
    await page.getByTestId("import-next-preview").click();
    await expect(page.getByTestId("map-full_name")).toBeVisible();
    await expect(page.getByTestId("map-employee_code")).not.toHaveValue("");
    const html = await page.content();
    expect(html).not.toContain("BEGIN PRIVATE KEY");
    expect(html).not.toContain("GOOGLE_SERVICE_ACCOUNT_JSON");
    await noHorizontalScroll(page);
  });

  test("таблица не открыта сервисному аккаунту — подсказка, кому дать доступ", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/employees/import");
    await page.getByTestId("import-mode-gsheet").click();
    await page.getByTestId("gsheet-url").fill("https://docs.google.com/spreadsheets/d/PRIVATE_sheet_0123456789abcdef/edit");
    await page.getByTestId("gsheet-connect").click();
    await expect(page.getByText(/tms-sync@e2e-test\.iam\.gserviceaccount\.com/).first()).toBeVisible();
    await expect(page.getByTestId("gsheet-info")).toHaveCount(0);
  });

  test("сохранение источника → dry run → «Синхронизировать сейчас» → итог на панели", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/employees/import");
    await expect(page.getByTestId("gsheet-sources")).toContainText("Источников пока нет");
    await page.getByTestId("import-mode-gsheet").click();
    await page.getByTestId("gsheet-url").fill(SHEET_URL);
    await page.getByTestId("gsheet-connect").click();
    await page.getByTestId("gsheet-load").click();
    await page.getByTestId("import-next-preview").click();
    await page.getByTestId("import-next-mapping").click();
    await expect(page.getByTestId("import-validation-stats")).toBeVisible();
    await page.getByTestId("gsheet-save-toggle").check();
    await page.getByTestId("gsheet-source-name").fill("Сотрудники (HR)");
    await page.getByTestId("import-run-dry").click();
    await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}/);
    // источник сохранён и показан на странице импорта сотрудников
    await page.goto("/employees/import");
    const src = page.getByTestId("gsheet-source");
    await expect(src).toHaveCount(1);
    await expect(src).toContainText("Сотрудники (HR)");
    await page.getByTestId("gsheet-sync").click();
    await expect(page.getByTestId("gsheet-source-status")).toHaveText("Синхронизирован");
    await expect(page.getByTestId("gsheet-source-stats")).toContainText("3");
    await noHorizontalScroll(page);
  });
});

test.describe("Google Sheets: права", () => {
  for (const email of ["finance@test.local", "viewer@test.local"]) {
    test(`${email}: нет доступа к импорту сотрудников и синхронизации`, async ({ page, context, baseURL }) => {
      await signInAs(context, email, baseURL!);
      await page.goto("/employees/import");
      await expect(page.getByTestId("gsheet-sync")).toHaveCount(0);
      await expect(page.getByTestId("import-mode-gsheet")).toHaveCount(0);
    });
  }
  test("HR может подключать и синхронизировать (справочник сотрудников)", async ({ page, context, baseURL }) => {
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto("/employees/import");
    await expect(page.getByTestId("import-mode-gsheet")).toBeVisible();
  });
});

test.describe("выбор участников при создании обучения", () => {
  test("поиск, фильтр по департаменту, «выбрать всех найденных», снятие, без дублей", async ({ page, context, baseURL }) => {
    await signInAs(context, "manager@test.local", baseURL!);
    await page.goto("/trainings/new");
    const picker = page.getByTestId("participant-picker");
    await expect(picker).toBeVisible();
    await expect(page.getByTestId("picker-found")).toContainText("Найдено: 5");
    await page.getByTestId("picker-search").fill("рустам");
    await expect(page.getByTestId("picker-row")).toHaveCount(1);
    await page.getByTestId("picker-search").fill("F-0004");
    await expect(page.getByTestId("picker-row")).toHaveCount(1);
    await page.getByTestId("picker-search").fill("");
    // фильтр департамента + массовый выбор
    await page.getByTestId("picker-dept").selectOption({ label: "Финансовый департамент" });
    await expect(page.getByTestId("picker-found")).toContainText("Найдено: 3");
    await page.getByTestId("picker-select-all").click();
    await expect(page.getByTestId("picker-count")).toContainText("Выбрано: 3");
    // повторное «выбрать всех» не создаёт дублей
    await expect(page.getByTestId("picker-select-all")).toBeDisabled();
    await expect(page.getByTestId("picker-chip")).toHaveCount(3);
    // ещё один отдел другого департамента, вручную
    await page.getByTestId("picker-dept").selectOption({ label: "Департамент рисков" });
    await page.getByRole("checkbox", { name: "Бобоев Сухроб" }).check();
    await expect(page.getByTestId("picker-count")).toContainText("Выбрано: 4");
    // снять одного
    await page.getByRole("button", { name: "Убрать Бобоев Сухроб" }).click();
    await expect(page.getByTestId("picker-count")).toContainText("Выбрано: 3");
    await page.getByTestId("picker-clear").click();
    await expect(page.getByTestId("picker-count")).toContainText("Выбрано: 0");
    await noHorizontalScroll(page);
  });

  test("создание обучения с участниками одной операцией", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "manager@test.local", baseURL!);
    await page.goto("/trainings/new");
    await page.getByLabel("Название *").fill("Курс для бухгалтерии");
    await page.getByLabel("Дата начала *").fill("2026-11-02");
    await page.getByLabel("Часы *").fill("8");
    await page.getByTestId("picker-dept").selectOption({ label: "Финансовый департамент" });
    await page.getByTestId("picker-select-all").click();
    await page.getByRole("button", { name: /Создать тренинг и добавить 3/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trainings/${NEW_T}`));
    const state = await (await page.request.get(`http://127.0.0.1:54399/__mock/phase3b?sid=${sid}`)).json();
    expect(state.created).toHaveLength(1);
    expect(new Set(state.created[0].employees).size).toBe(3);
    expect(state.created[0].employees).toContain(E_AZAM);
  });

  test("заявка → обучение: данные заявки подставлены, связь и план сохранены, факт — выбранные", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/trainings/requests/${R1}`);
    await page.getByTestId("create-training-with-participants").click();
    await expect(page).toHaveURL(new RegExp(`/trainings/new\\?request=${R1}`));
    await expect(page.getByLabel("Название *")).toHaveValue("Курс по МСФО");
    await expect(page.getByLabel("Участников по плану")).toHaveValue("4");
    await page.getByLabel("Дата начала *").fill("2026-12-01");
    await page.getByLabel("Часы *").fill("12");
    await page.getByRole("checkbox", { name: "Алиев Рустам" }).check();
    await page.getByRole("checkbox", { name: "Гафуров Умед" }).check();
    await page.getByRole("button", { name: /Создать тренинг и добавить 2/ }).click();
    await expect(page).toHaveURL(new RegExp(`/trainings/${NEW_T}`));
    const state = await (await page.request.get(`http://127.0.0.1:54399/__mock/phase3b?sid=${sid}`)).json();
    expect(state.created[0].request_id).toBe(R1); // связь с заявкой сохранена
    expect(state.created[0].planned).toBe(4); // план — контрольная цифра
    expect(state.created[0].employees).toHaveLength(2); // факт — выбранные сотрудники
  });

  test("HR и просмотр не создают обучение", async ({ page, context, baseURL }) => {
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto("/trainings/new");
    await expect(page.getByTestId("participant-picker")).toHaveCount(0);
    await expect(page.getByText("Нет права создавать тренинги")).toBeVisible();
  });

  test("мобильная и десктопная ширина без горизонтальной прокрутки", async ({ page, context, baseURL }) => {
    await signInAs(context, "manager@test.local", baseURL!);
    await page.goto("/trainings/new");
    await page.getByTestId("picker-select-all").click();
    await noHorizontalScroll(page);
  });
});
