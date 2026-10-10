import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

// Оргструктура: справочник подразделений, массовое добавление (предпросмотр → подтверждение), разрешение замечания импорта.
// Mock (e2e/mock-phase3c.mjs) только имитирует RPC; настоящую логику проверяет supabase/tests/phase3c_tests.sql.
const MOCK = "http://127.0.0.1:54399";
const JOB = "dddddddd-dddd-4ddd-8ddd-000000000001";
const DONE_JOB = "dddddddd-dddd-4ddd-8ddd-000000000002";
const FINISH_JOB = "dddddddd-dddd-4ddd-8ddd-000000000003";
const MAP_JOB = "dddddddd-dddd-4ddd-8ddd-000000000005";

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

// Регресс HOTFIX M25: состояние Production — задание «Применён» (COMMITTED), строка NEEDS_REVIEW с UNIT_UNKNOWN.
test.describe("применённый импорт: строки UNIT_UNKNOWN можно разрешать", () => {
  test("действия доступны, создание отдела → «Проверить снова» обновляет строку, сотрудники не затрагиваются", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "hr@test.local", baseURL!);
    await page.goto(`/imports/${DONE_JOB}`);
    await expect(page.getByTestId("import-job-status")).toHaveText("Применён");
    const box = page.getByTestId("import-unit-resolver");
    await expect(box).toContainText("Цех откорма");
    await expect(box.getByTestId("import-unit-create")).toBeVisible();
    await expect(box.getByTestId("import-unit-map")).toBeVisible();
    await expect(box.getByTestId("import-unit-recheck")).toBeVisible();
    await expect(box.getByTestId("import-unit-applied-note")).toBeVisible();
    // решения «применить/пропустить» после применения недоступны
    await expect(page.getByTestId("import-skip")).toHaveCount(0);
    await box.getByTestId("import-unit-create").click();
    await expect(page.getByTestId("import-unit-resolver")).toHaveCount(0, { timeout: 15_000 });
    const state = await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json();
    expect(state.doneRow.status).toBe("NEW");
    expect(state.doneReanalyzed).toBeGreaterThanOrEqual(1);
  });

  test("закреплённый алиас: сопоставить и «Проверить снова» в применённом задании", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "admin@test.local", baseURL!);
    await page.goto(`/imports/${DONE_JOB}`);
    const box = page.getByTestId("import-unit-resolver");
    await box.getByLabel("Существующее подразделение").selectOption({ label: "Бухгалтерия" });
    await box.getByTestId("import-unit-map").click();
    await expect.poll(async () => (await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json()).doneReanalyzed ?? 0).toBeGreaterThanOrEqual(1);
    const state = await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json();
    expect(state.aliases).toHaveLength(1);
    expect(state.units).toHaveLength(3);
  });
});

// M26: дозавершение применённого импорта — пакетный разбор, предпросмотр, подтверждение с причиной, прогресс и итог.
test.describe("дозавершение применённого импорта (M26)", () => {
  test("перепроверить → предпросмотр → применить с подтверждением: итог и сохранение в БД", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "hr@test.local", baseURL!);
    await page.goto(`/imports/${FINISH_JOB}`);
    const panel = page.getByTestId("import-finish-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("import-finish-unresolved")).toHaveText("5");
    await expect(page.getByTestId("import-finish-ready")).toHaveText("0");
    await expect(page.getByTestId("import-finish-names")).toContainText("Птицефабрика №2");
    await expect(page.getByTestId("import-finish-apply")).toBeDisabled(); // применять пока нечего
    await page.getByTestId("import-finish-reanalyze").click();
    await expect(page.getByTestId("import-finish-ready")).toHaveText("4");
    await expect(page.getByTestId("import-finish-unresolved")).toHaveText("1");
    await expect(page.getByTestId("import-finish-create")).toHaveText("3");
    await expect(page.getByTestId("import-finish-update")).toHaveText("1");
    await expect(page.getByTestId("import-finish-reanalyze-note")).toContainText("Подразделение найдено: 4");
    // до подтверждения ничего не применено
    let state = await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json();
    expect(state.fin.applyCalls).toBe(0);
    await page.getByTestId("import-finish-apply").click();
    const dlg = page.getByTestId("import-finish-dialog");
    await expect(dlg).toContainText("создать 3, обновить 1");
    await dlg.getByRole("button", { name: "Применить" }).click(); // без причины не уходит
    state = await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json();
    expect(state.fin.applyCalls).toBe(0);
    await dlg.locator("textarea").fill("Дозавершение после исправления справочника");
    await dlg.getByRole("button", { name: "Применить" }).click();
    await expect(page.getByTestId("import-finish-summary")).toContainText("создано 3, обновлено 1", { timeout: 20_000 });
    await expect(page.getByTestId("import-finish-ready")).toHaveText("0");
    state = await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json();
    expect(state.fin.applyCalls).toBe(2); // пакеты по 2 строки
    expect(state.fin.reasons.every((r: string) => r.includes("Дозавершение"))).toBe(true);
    expect(state.fin.created).toBe(3);
    expect(state.fin.updated).toBe(1);
  });

  test("VIEWER не видит панель дозавершения", async ({ page, context, baseURL }) => {
    await signInAs(context, "viewer@test.local", baseURL!);
    await page.goto(`/imports/${FINISH_JOB}`);
    await expect(page.getByTestId("import-finish-panel")).toHaveCount(0);
  });
});

// M27: массовое сопоставление оргструктуры — по уникальным значениям, а не по строкам: выбор → предпросмотр → подтверждение → разбор → применение.
// Mock имитирует RPC; настоящую логику (контекст, дубли, идемпотентность, права) проверяет supabase/tests/hotfix4_orgmap_tests.sql.
test.describe("массовое сопоставление оргструктуры (M27)", () => {
  test("значения → предпросмотр без записи → подтверждение с причиной → перепроверка → применение готовых", async ({ page, context, baseURL }) => {
    const sid = await signInAs(context, "hr@test.local", baseURL!);
    const st = async () => (await (await page.request.get(`${MOCK}/__mock/phase3c?sid=${sid}`)).json()).map;
    await page.goto(`/imports/${MAP_JOB}`);
    await expect(page.getByTestId("orgmap-section")).toBeVisible();
    // сохранённое ранее недопустимое сопоставление (запись-путь «A → B») видно и может быть снято; счётчик показывает число сохранённых сопоставлений
    await expect(page.getByTestId("orgmap-saved")).toHaveText("1");
    await expect(page.getByTestId("orgmap-saved-row")).toContainText("Продажи Х (Опт)");
    await expect(page.getByTestId("orgmap-saved-invalid")).toContainText("Запись-путь");
    await page.getByTestId("orgmap-saved-clear").check();
    await expect(page.getByTestId("orgmap-preview-btn")).toContainText("(1)"); // отметка «снять» попала в набор пунктов
    await page.getByTestId("orgmap-saved-clear").uncheck();
    await expect(page.getByTestId("orgmap-preview-btn")).not.toContainText("(1)");
    // 4 уникальных значения вместо 10 строк
    await expect(page.getByTestId("orgmap-groups")).toHaveText("4");
    await expect(page.getByTestId("orgmap-rows")).toHaveText("10");
    await expect(page.getByTestId("orgmap-causes")).toContainText("Есть у другого департамента");
    await expect(page.getByTestId("orgmap-causes")).toContainText("Сначала сопоставьте департамент");
    await expect(page.getByTestId("orgmap-list").locator(":scope > li")).toHaveCount(4);
    await expect(page.getByTestId("orgmap-row-0")).toContainText("«Кадры»");
    await expect(page.getByTestId("orgmap-row-0")).toContainText("Департамент рисков › Отдел кадров"); // кандидат с полным путём
    // отдел чужого департамента выбрать нельзя (disabled), по значению «Цех Х» действий нет (сначала департамент)
    await page.getByTestId("orgmap-action-0").selectOption("MAP");
    await expect(page.getByTestId("orgmap-target-0").locator("option", { hasText: "Департамент рисков › Отдел кадров" })).toBeDisabled();
    await page.getByTestId("orgmap-target-0").selectOption({ label: "Финансовый департамент › Отдел кадров" });
    await expect(page.getByTestId("orgmap-row-3")).toContainText("Сначала сопоставьте департамент");
    await expect(page.getByTestId("orgmap-action-3")).toHaveCount(0);
    // «Охрана труда»: создать под своим департаментом — только с подтверждением, что это другое подразделение
    await page.getByTestId("orgmap-action-1").selectOption("CREATE");
    await expect(page.getByTestId("orgmap-homonym-1")).toBeVisible();
    // «Птицефабрика №2» — нигде нет: создать
    await page.getByTestId("orgmap-bulk-create").click();
    await expect(page.getByTestId("orgmap-action-2")).toHaveValue("CREATE");
    await page.getByTestId("orgmap-preview-btn").click();
    // предпросмотр: «Охрана труда» без подтверждения омонима отклонена; ничего не сохранено
    await expect(page.getByTestId("orgmap-preview-summary")).toContainText("допустимо: 2, отклонено: 1");
    await expect(page.getByTestId("orgmap-preview-error")).toContainText("подтвердите, что это другое подразделение");
    let m = await st();
    expect(m.previewCalls).toBeGreaterThan(0);
    expect(m.saveCalls).toBe(0);
    await page.getByTestId("orgmap-homonym-1").check();
    await expect(page.getByTestId("orgmap-preview")).toHaveCount(0); // изменение выбора сбрасывает предпросмотр
    await page.getByTestId("orgmap-preview-btn").click();
    await expect(page.getByTestId("orgmap-preview-summary")).toContainText("допустимо: 3, отклонено: 0");
    await expect(page.getByTestId("orgmap-preview-summary")).toContainText("Затронуто строк: 9");
    await expect(page.getByTestId("orgmap-preview-summary")).toContainText("Останется нерешённых значений: 1");
    m = await st();
    expect(m.saveCalls).toBe(0);
    // сохранение — только после подтверждения с причиной
    await page.getByTestId("orgmap-save-btn").click();
    const dlg = page.getByTestId("orgmap-dialog");
    await dlg.getByRole("button", { name: "Сохранить" }).click(); // без причины не уходит
    m = await st();
    expect(m.saveCalls).toBe(0);
    await dlg.locator("textarea").fill("Сверка с кадровой службой");
    await dlg.getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByTestId("orgmap-note")).toContainText("Сохранено значений: 3", { timeout: 20_000 });
    await expect(page.getByTestId("orgmap-note")).toContainText("затронуто строк: 9");
    m = await st();
    expect(m.saveCalls).toBe(1);
    expect(m.reasons[0]).toBe("Сверка с кадровой службой");
    expect(m.reanalyzeCalls).toBeGreaterThan(0); // перепроверка всех строк выполнена автоматически, без «Перепроверить» на каждой строке
    expect(m.saved.map((x: { action: string }) => x.action).sort()).toEqual(["CREATE", "CREATE", "MAP"]);
    // остались: готово к применению 9 строк, значение «Цех Х» ждёт департамента
    await expect(page.getByTestId("import-finish-ready")).toHaveText("9");
    await expect(page.getByTestId("orgmap-groups")).toHaveText("1");
    await expect(page.getByTestId("orgmap-rows")).toHaveText("1");
    // применение готовых — отдельное подтверждение с причиной, пакетами
    await page.getByTestId("import-finish-apply").click();
    const adlg = page.getByTestId("import-finish-dialog");
    await adlg.locator("textarea").fill("Дозавершение после сопоставления оргструктуры");
    await adlg.getByRole("button", { name: "Применить" }).click();
    await expect(page.getByTestId("import-finish-summary")).toContainText("создано 8, обновлено 1", { timeout: 20_000 });
    await expect(page.getByTestId("import-finish-summary")).toContainText("Дубли внутри файла (не применяются): 2");
    await expect(page.getByTestId("import-finish-ready")).toHaveText("0");
    m = await st();
    expect(m.fin.created).toBe(8);
    expect(m.fin.updated).toBe(1);
    expect(m.fin.reasons.every((r: string) => r.includes("Дозавершение"))).toBe(true);
  });

  test("VIEWER не видит сопоставление", async ({ page, context, baseURL }) => {
    await signInAs(context, "viewer@test.local", baseURL!);
    await page.goto(`/imports/${MAP_JOB}`);
    await expect(page.getByTestId("orgmap-section")).toHaveCount(0);
  });
});
