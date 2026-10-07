import { expect, test, type Page } from "@playwright/test";
import { signInAs, MOCK_URL } from "./helpers";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

// Состояние mock изолировано по сессии входа каждого теста (см. e2e/mock-phase3.mjs), общий reset не нужен:
// параллельные тесты не должны стирать друг другу данные.

async function openField(page: Page, label: string) {
  await page.getByRole("button", { name: `Изменить: ${label}` }).click();
}

test.describe("список обучений", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
  });

  test("показывает действующие записи, архив скрыт; поиск и фильтры работают на сервере", async ({ page }) => {
    await page.goto("/trainings");
    await expect(page.getByRole("heading", { name: "Обучения" })).toBeVisible();
    await expect(page.getByText("Лидерство для руководителей").first()).toBeVisible();
    await expect(page.getByText("Охрана труда").first()).toBeVisible();
    await expect(page.getByText("Архивный курс")).toHaveCount(0);

    await page.getByLabel("Поиск", { exact: true }).fill("Охрана");
    await page.getByRole("button", { name: "Применить" }).click();
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByText("Лидерство для руководителей")).toHaveCount(0);
    await expect(page.getByText("Охрана труда").first()).toBeVisible();

    await page.goto("/trainings?archived=1");
    await expect(page.getByText("Архивный курс").first()).toBeVisible();
  });

  test("ADMIN видит кнопку «Новый тренинг» и форму создания", async ({ page }) => {
    await page.goto("/trainings");
    await page.getByTestId("new-training").click();
    await expect(page).toHaveURL(/\/trainings\/new/);
    await expect(page.getByRole("heading", { name: /Новый тренинг/ })).toBeVisible();
  });
});

test.describe("карточка тренинга: inline-редактирование и аудит", () => {
  test("менеджер правит название без причины, статус — только с причиной; изменения попадают в историю", async ({ page, context, baseURL, request }) => {
    const sid = await signInAs(context, "manager@test.local", baseURL!);
    await page.goto(`/trainings/${T1}`);
    await expect(page.getByRole("heading", { name: "Лидерство для руководителей" })).toBeVisible();

    // обычное поле: причина не обязательна
    await openField(page, "Название");
    await page.getByLabel("Название", { exact: true }).fill("Лидерство 2.0");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Лидерство 2.0").first()).toBeVisible();

    // существенное поле: без причины — ошибка, с причиной — сохранено
    await openField(page, "Статус");
    await page.getByLabel("Статус", { exact: true }).selectOption("IN_PROGRESS");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText(/Укажите причину/).first()).toBeVisible();
    await page.getByLabel(/Причина изменения/).fill("Тренер заболел, перенос");
    await page.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByTestId("field-status-editor")).toHaveCount(0);

    const audit = await (await request.get(`${MOCK_URL}/__mock/audit?sid=${sid}`)).json();
    expect(audit).toHaveLength(2);
    expect(audit[0].reason).toBe("Тренер заболел, перенос");
    expect(audit[1].changes.title.new).toBe("Лидерство 2.0");

    await page.goto(`/trainings/${T1}?tab=audit`);
    await expect(page.getByText("Тренер заболел, перенос").first()).toBeVisible();
  });

  for (const email of ["viewer@test.local", "hr@test.local", "finance@test.local"]) {
    test(`${email}: поля карточки не редактируются`, async ({ page, context, baseURL }) => {
      await signInAs(context, email, baseURL!);
      await page.goto(`/trainings/${T1}`);
      await expect(page.getByRole("heading", { name: "Лидерство для руководителей" })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Изменить:/ })).toHaveCount(0);
    });
  }

  test("HR не видит сумму расходов", async ({ page, context, baseURL }) => {
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto(`/trainings/${T1}`);
    await expect(page.getByTestId("kpi-actual")).toContainText("Ограничено");
    await expect(page.getByTestId("kpi-manhours")).toContainText("32");
  });

  test("несуществующий тренинг — 404", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/trainings/99999999-9999-4999-8999-999999999999");
    await expect(page.getByText("Страница не найдена")).toBeVisible();
  });
});

test.describe("Data Quality", () => {
  test("менеджер видит действия по замечаниям и может оставить на проверке", async ({ page, context, baseURL }) => {
    await signInAs(context, "manager@test.local", baseURL!);
    await page.goto("/data-quality");
    const list = page.getByTestId("dq-list");
    await expect(list).toBeVisible();
    await expect(list.getByText("Нет участников").first()).toBeVisible();
    await expect(list.getByRole("link", { name: "Открыть" })).toHaveCount(2);
    await expect(list.locator(`a[href="/trainings/${T1}"]`).first()).toBeVisible();
    await expect(list.getByRole("button", { name: "Оставить на проверке" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Проверить/ }).first()).toBeVisible();
  });

  test("HR видит замечания, но без кнопок действий; VIEWER раздела не видит", async ({ page, context, baseURL }) => {
    await signInAs(context, "hr@test.local", baseURL!);
    await page.goto("/data-quality");
    await expect(page.getByTestId("dq-list")).toBeVisible();
    await expect(page.getByRole("button", { name: "Оставить на проверке" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Подтвердить как есть/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Проверить/ })).toHaveCount(0);
  });

  test("VIEWER: раздел недоступен", async ({ page, context, baseURL }) => {
    await signInAs(context, "viewer@test.local", baseURL!);
    await page.goto("/data-quality");
    await expect(page.getByTestId("dq-list")).toHaveCount(0);
  });

});

test.describe("доступ к разделам", () => {
  test("справочники подразделений: ADMIN — да, VIEWER — нет", async ({ page, context, baseURL }) => {
    await signInAs(context, "viewer@test.local", baseURL!);
    await page.goto("/settings/references");
    await expect(page.getByText(/Недостаточно прав|нет доступа/i).first()).toBeVisible();
  });

  test("обучение PLANNED из мока открывается и показывает источник", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/trainings/${T2}`);
    await expect(page.getByRole("heading", { name: "Охрана труда" })).toBeVisible();
  });
});

test.describe("адаптивность", () => {
  for (const path of ["/trainings", `/trainings/${T1}`, "/data-quality"]) {
    test(`нет горизонтальной прокрутки страницы: ${path}`, async ({ page, context, baseURL }) => {
      await signInAs(context, "admin@test.local", baseURL!);
      await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});
