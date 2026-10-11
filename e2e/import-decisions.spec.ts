import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// Решения по сотрудникам в применённом импорте (M30). Mock (e2e/mock-phase3d.mjs) только имитирует RPC;
// настоящую логику проверяет supabase/tests/hotfix7_resolve_committed_tests.sql.
const MOCK = "http://127.0.0.1:54399";
const JOB = "dddddddd-dddd-4ddd-8ddd-000000000007";
const state = async (page: import("@playwright/test").Page, sid: string) => (await page.request.get(`${MOCK}/__mock/phase3d?sid=${sid}`)).json();

test.describe("решения по сотрудникам после применения задания", () => {
  test("на карточках применённого задания есть кнопки решений; массовые кнопки и применение с причиной", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "hr@test.local", baseURL!);
    await page.goto(`/imports/${JOB}`);
    await expect(page.getByTestId("import-job-status")).toContainText("Применён");
    const panel = page.getByTestId("import-decisions-panel");
    await expect(panel).toContainText("Сотрудники, которых нужно проверить: 4");
    await expect(page.getByTestId("import-decisions-undecided")).toHaveText("4");
    // кнопки решений видны на карточках (раньше после применения их не было)
    const cards = page.getByTestId("import-row");
    await expect(cards).toHaveCount(4);
    await expect(cards.first().getByTestId("import-apply-row")).toContainText("Создать нового сотрудника");
    await expect(cards.first().getByTestId("import-skip")).toBeVisible();
    await expect(cards.first().getByTestId("import-match")).toContainText("Иванов Иван Иванович");
    await expect(page.getByTestId("import-decisions-apply")).toBeDisabled();

    // решение по одной строке: «Сопоставить» (Петров) — применять пока нельзя без причины
    await cards.nth(1).getByTestId("import-match").click();
    await expect(page.getByTestId("import-decisions-match")).toHaveText("1", { timeout: 15_000 });
    await expect(cards.nth(1)).toContainText("Решение: сопоставить с существующим");
    // «Пропустить» для третьей строки
    await cards.nth(2).getByTestId("import-skip").click();
    await expect(page.getByTestId("import-decisions-skip")).toHaveText("1", { timeout: 15_000 });
    // массово «создать» для всех без решения (остались 2: первая и четвёртая)
    await page.getByTestId("import-decisions-all-create").click();
    await expect(page.getByTestId("import-decisions-create")).toHaveText("2", { timeout: 15_000 });
    await expect(page.getByTestId("import-decisions-undecided")).toHaveText("0");
    let s = await state(page, sid);
    expect(s.bulkCalls).toEqual(["APPLY"]);
    expect(s.created).toBe(0); // решения сами ничего не создают
    expect(s.applyCalls).toHaveLength(0);

    // применение: без причины не уходит
    await page.getByTestId("import-decisions-apply").click();
    const dlg = page.getByTestId("import-decisions-dialog");
    await expect(dlg).toContainText("создано сотрудников: 2, обновлено существующих: 1");
    await dlg.getByRole("button", { name: "Применить" }).click();
    s = await state(page, sid);
    expect(s.applyCalls).toHaveLength(0);
    await dlg.locator("textarea").fill("Решения по спорным сотрудникам, проверено кадрами");
    await dlg.getByRole("button", { name: "Применить" }).click();
    await expect(page.getByTestId("import-decisions-result")).toContainText("Создано 2, обновлено 1", { timeout: 20_000 });
    s = await state(page, sid);
    expect(s.created).toBe(2);
    expect(s.updated).toBe(1);
    expect(s.applyCalls.length).toBeGreaterThanOrEqual(2); // пакеты по 2 строки → несколько шагов
    expect(s.reasons.every((r: string) => r === "Решения по спорным сотрудникам, проверено кадрами")).toBe(true);
    // осталась одна пропущенная строка, кнопка применения недоступна
    await expect(page.getByTestId("import-decisions-skip")).toHaveText("1");
    await expect(page.getByTestId("import-decisions-apply")).toBeDisabled();
  });

  test("«Снять все решения» возвращает строки к «Без решения»", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "hr@test.local", baseURL!);
    await page.goto(`/imports/${JOB}`);
    await page.getByTestId("import-decisions-all-skip").click();
    await expect(page.getByTestId("import-decisions-skip")).toHaveText("4", { timeout: 15_000 });
    await page.getByTestId("import-decisions-clear").click();
    await expect(page.getByTestId("import-decisions-undecided")).toHaveText("4", { timeout: 15_000 });
    const s = await state(page, sid);
    expect(s.bulkCalls).toEqual(["SKIP", "CLEAR"]);
    expect(s.created + s.updated).toBe(0);
  });

  test("роль без права не видит панель решений и кнопок", async ({ page, context, baseURL }) => {
    await signInAs(context, "viewer@test.local", baseURL!);
    await page.goto(`/imports/${JOB}`);
    await expect(page.getByTestId("import-decisions-panel")).toHaveCount(0);
    await expect(page.getByTestId("import-apply-row")).toHaveCount(0);
  });
});
