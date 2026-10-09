import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./helpers";

// HOTFIX 413: импорт сотрудников пакетами. Mock (e2e/mock-phase3b.mjs) имитирует M23 (begin/append/finish, import_commit_batch);
// транзакционность пакетов, откат по таймауту и защита от дублей проверяются SQL-набором supabase/tests/hotfix_import_tests.sql.
const MOCK = "http://127.0.0.1:54399";
const LIMIT = 1024 * 1024; // лимит тела Server Action по умолчанию

/** CSV кадровой выгрузки: n строк, кириллица и длинный комментарий — как реальный файл, который давал 413. */
function employeesCsv(n: number): Buffer {
  const head = "Таб. №;ФИО;Должность;Департамент;Отдел;Email;Телефон;Комментарий";
  const note = "Перевод из другого подразделения по приказу, стажировка завершена, наставник назначен".repeat(2);
  const lines = Array.from({ length: n }, (_, i) => {
    const k = String(i + 1).padStart(5, "0");
    return `T-${k};Сотрудников${k} Работник Отчествович;Специалист отдела учёта;Финансовый департамент;Бухгалтерия;user${k}@example.test;+992900${k};${note}`;
  });
  return Buffer.from([head, ...lines].join("\n"), "utf8");
}

async function uploadAndAnalyze(page: Page, n: number) {
  await page.goto("/employees/import");
  await page.getByTestId("import-file").setInputFiles({ name: "employees.csv", mimeType: "text/csv", buffer: employeesCsv(n) });
  await page.getByTestId("import-next-upload").click();
  await expect(page.getByTestId("import-preview-stats")).toContainText(`строк с данными: ${n}`);
  await page.getByTestId("import-next-preview").click();
  await page.getByTestId("import-next-mapping").click();
  await page.getByTestId("import-run-dry").click();
  await expect(page).toHaveURL(/\/imports\/[0-9a-f-]{36}/, { timeout: 60_000 });
}

async function commitWithReason(page: Page) {
  await page.getByTestId("import-commit").click();
  await page.locator("#import-commit-dialog-reason").fill("Загрузка кадровой выгрузки");
  await page.getByTestId("import-commit-dialog").getByRole("button", { name: "Применить" }).click();
}

test.describe("импорт 2646 сотрудников пакетами", () => {
  test.setTimeout(120_000);

  test("dry run и применение: ни один запрос не превышает 1 МБ, все 2646 строк применены", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "hr@test.local", baseURL!);
    const sizes: number[] = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && new URL(r.url()).pathname.startsWith("/employees/import")) sizes.push(r.postDataBuffer()?.length ?? 0);
    });
    await uploadAndAnalyze(page, 2646);

    expect(sizes.length).toBeGreaterThanOrEqual(10); // begin + 9 частей + finish (+ сохранение источника, если есть)
    expect(Math.max(...sizes)).toBeLessThan(LIMIT); // каждый запрос меньше лимита
    expect(sizes.reduce((a, b) => a + b, 0)).toBeGreaterThan(LIMIT); // а одним запросом было бы > 1 МБ → прежний 413
    await expect(page.getByTestId("import-count-NEW")).toContainText("2646");

    await commitWithReason(page);
    await expect(page.getByTestId("import-result")).toContainText("добавлено 2646", { timeout: 60_000 });
    await expect(page.getByTestId("import-job-status")).toHaveText("Применён");
    const state = await (await page.request.get(`${MOCK}/__mock/phase3b?sid=${sid}`)).json();
    expect(state.batchCalls).toBeGreaterThanOrEqual(18); // адаптивные пакеты 120 → 150: не меньше ⌈2646 / 150⌉ = 18
  });

  test("сбой посреди применения: импорт не объявлен завершённым, после перезагрузки продолжается без дублей", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "admin@test.local", baseURL!);
    await uploadAndAnalyze(page, 400);
    await page.request.get(`${MOCK}/__mock/phase3b/fail-next-batch?sid=${sid}&after=2`); // 2 пакета ок (120 + 150 строк), третий — таймаут
    await commitWithReason(page);
    // Клиент сливает пакеты по HTTP в пределах бюджета (несколько RPC за вызов); под параллельной нагрузкой это дольше
    // дефолтных 5 с. Ошибку проверяем ОДНИМ ожиданием (regex на обе фразы): сразу после показа ошибки run() делает
    // router.refresh(), и карточка переключается на ветку COMMITTING, размонтируя диалог, — двум отдельным await не хватает окна.
    await expect(page.getByTestId("import-commit-dialog")).toContainText(/Применение остановлено[\s\S]*повтор безопасен/, { timeout: 30_000 });

    await page.reload();
    await expect(page.getByTestId("import-job-status")).toHaveText("Применяется (не завершено)");
    await expect(page.getByTestId("import-commit-resume")).toBeVisible();
    await expect(page.getByTestId("import-commit-progress")).toContainText("Обработано строк: 270 из 400");
    await expect(page.getByTestId("import-result")).toHaveCount(0);

    await page.getByTestId("import-commit-continue").click();
    await expect(page.getByTestId("import-result")).toContainText("добавлено 400", { timeout: 30_000 });
    const state = await (await page.request.get(`${MOCK}/__mock/phase3b?sid=${sid}`)).json();
    const job = state.jobs.find((j: { status: string }) => j.status === "COMMITTED");
    expect(job._rows.filter((r: { action?: string }) => r.action === "CREATED")).toHaveLength(400); // ни одна строка не применена дважды
  });

  test("650 строк: одно задание, каждая строка принята ровно один раз", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "hr@test.local", baseURL!);
    await uploadAndAnalyze(page, 650);
    const state = await (await page.request.get(`${MOCK}/__mock/phase3b?sid=${sid}`)).json();
    expect(state.jobs).toHaveLength(1);
    expect(state.jobs[0].total_rows).toBe(650);
    expect(new Set(state.jobs[0]._rows.map((r: { row_no: number }) => r.row_no)).size).toBe(650);
  });

  test("VIEWER не видит мастер импорта сотрудников", async ({ page, context, baseURL }) => {
    await signInAs(context, "viewer@test.local", baseURL!);
    await page.goto("/employees/import");
    await expect(page.getByTestId("import-file")).toHaveCount(0);
  });
});
