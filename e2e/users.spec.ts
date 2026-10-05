import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { MOCK_URL, signInAs } from "./helpers";

const NEW_PASSWORD = "very-long-passphrase-1";
const NEWER_PASSWORD = "even-longer-passphrase-2";

async function lastMail(request: APIRequestContext, email: string, type: "invite" | "recovery") {
  const res = await request.get(`${MOCK_URL}/__mock/outbox?email=${encodeURIComponent(email)}`);
  const mails = ((await res.json()) as { type: string; token: string; redirectTo?: string }[]).filter((m) => m.type === type);
  return { count: mails.length, last: mails.at(-1) };
}

const uniqueEmail = (project: string, tag: string) => `${tag}-${project}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@test.local`;

async function openUsers(page: Page, email?: string) {
  await page.goto("/settings/users");
  await expect(page.getByRole("heading", { name: "Пользователи" })).toBeVisible();
  if (email) await page.getByLabel("Поиск по таблице").fill(email);
}
const rowOf = (page: Page, email: string) => page.getByRole("row").filter({ hasText: email });
const notice = (page: Page) => page.getByRole("status");

async function rowAction(page: Page, name: string, item: string) {
  await page.getByRole("button", { name: `Действия: ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
}

test.describe("доступ к разделу Users", () => {
  test("ADMIN: из настроек открывает таблицу со всеми колонками", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/settings");
    await page.getByRole("link", { name: /Управление пользователями/ }).click();
    await expect(page).toHaveURL(/\/settings\/users$/);
    for (const col of ["ФИО", "Email", "Роль", "Статус", "Приглашён / подтверждён", "Последний вход"]) {
      await expect(page.getByRole("columnheader", { name: col })).toBeVisible();
    }
    await expect(rowOf(page, "hr@test.local")).toContainText("HR");
    await expect(rowOf(page, "hr@test.local")).toContainText("Активен");
    await expect(rowOf(page, "admin@test.local")).toContainText("(вы)");
    await expect(page.getByRole("button", { name: /Действия: Тестовый Админ/ })).toHaveCount(0); // над собой действий нет
    await expect(page.getByRole("button", { name: "Пригласить пользователя" })).toBeVisible();
  });

  for (const user of ["hr@test.local", "viewer@test.local"]) {
    test(`${user}: прямой URL — отказ, данные не показываются`, async ({ page, context, baseURL }) => {
      await signInAs(context, user, baseURL!);
      await page.goto("/settings/users");
      await expect(page.getByText("Нет доступа к разделу")).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
      await expect(page.getByText("admin@test.local")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Пригласить пользователя" })).toHaveCount(0);
      await page.goto("/settings");
      await expect(page.getByRole("link", { name: /Управление пользователями/ })).toHaveCount(0);
    });
  }

  test("аноним уходит на вход", async ({ page }) => {
    await page.goto("/settings/users");
    await expect(page).toHaveURL(/\/login\?next=%2Fsettings%2Fusers$/);
  });

  test("нет горизонтальной прокрутки страницы", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await openUsers(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe("жизненный цикл пользователя", () => {
  test("приглашение → роль → повторное приглашение → пароль → вход → сброс → деактивация → восстановление", async ({ page, context, baseURL, browser, request }, testInfo) => {
    test.setTimeout(120_000);
    const email = uniqueEmail(testInfo.project.name, "life");
    const name = "Тестовый Приглашённый";
    await signInAs(context, "admin@test.local", baseURL!);
    await openUsers(page);

    // 1. приглашение
    await page.getByRole("button", { name: "Пригласить пользователя" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Отправить приглашение" }).click();
    await expect(dialog.getByText("Введите ФИО (не короче 2 символов)")).toBeVisible();
    await expect(dialog.getByText("Введите email")).toBeVisible();
    await dialog.getByLabel("ФИО").fill(name);
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByLabel("Роль").selectOption("VIEWER");
    await dialog.getByRole("button", { name: "Отправить приглашение" }).click();
    await expect(notice(page)).toContainText(`Приглашение отправлено на ${email}`);
    await page.getByLabel("Поиск по таблице").fill(email);
    await expect(rowOf(page, email)).toContainText("Приглашён");
    await expect(rowOf(page, email)).toContainText("Наблюдатель");
    await expect(rowOf(page, email)).toContainText("не подтверждён");
    const first = await lastMail(request, email, "invite");
    expect(first.count).toBe(1);
    expect(first.last?.redirectTo).toMatch(/\/auth\/confirm$/);

    // 2. повторное приглашение того же email отклоняется только после подтверждения; пока — разрешено через Resend
    await rowAction(page, name, "Повторно отправить приглашение");
    await expect(notice(page)).toContainText("Приглашение отправлено повторно");
    const second = await lastMail(request, email, "invite");
    expect(second.count).toBe(2);
    await page.getByRole("button", { name: `Действия: ${name}` }).click();
    await expect(page.getByRole("menuitem", { name: /Отправить ссылку сброса/ })).toHaveCount(0); // не подтверждён
    await page.keyboard.press("Escape");

    // 3. смена роли
    await rowAction(page, name, "Изменить роль");
    await page.getByRole("dialog").getByLabel("Роль").selectOption("FINANCE");
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
    await expect(notice(page)).toContainText("Роль изменена");
    await expect(rowOf(page, email)).toContainText("Финансы");

    // 4. старая ссылка приглашения... последняя работает; пользователь задаёт пароль
    const userCtx = await browser.newContext();
    const userPage = await userCtx.newPage();
    await userPage.goto(`${baseURL}/auth/confirm?token_hash=${second.last!.token}&type=invite`);
    await expect(userPage).toHaveURL(/\/auth\/set-password$/);
    await expect(userPage.getByRole("heading", { name: "Создайте пароль" })).toBeVisible();
    await userPage.getByRole("button", { name: "Сохранить пароль и войти" }).click();
    await expect(userPage.getByText(/не короче 12 символов/).first()).toBeVisible();
    await userPage.getByLabel("Новый пароль").fill(NEW_PASSWORD);
    await userPage.getByLabel("Повторите пароль").fill(NEW_PASSWORD + "x");
    await userPage.getByRole("button", { name: "Сохранить пароль и войти" }).click();
    await expect(userPage.getByText("Пароли не совпадают")).toBeVisible();
    await userPage.getByLabel("Новый пароль").fill("leaked-password-123");
    await userPage.getByLabel("Повторите пароль").fill("leaked-password-123");
    await userPage.getByRole("button", { name: "Сохранить пароль и войти" }).click();
    await expect(userPage.getByTestId("set-password-form").getByRole("alert")).toContainText("слишком простой");
    await userPage.getByLabel("Новый пароль").fill(NEW_PASSWORD);
    await userPage.getByLabel("Повторите пароль").fill(NEW_PASSWORD);
    await userPage.getByRole("button", { name: "Сохранить пароль и войти" }).click();
    await expect(userPage).toHaveURL(/\/dashboard/);
    // ссылка одноразовая
    const reuse = await userCtx.newPage();
    await reuse.goto(`${baseURL}/auth/confirm?token_hash=${second.last!.token}&type=invite`);
    await expect(reuse).toHaveURL(/\/auth\/error$/);
    await userCtx.close();

    // 5. вход с новым паролем; Users недоступен новой роли
    const loginCtx = await browser.newContext();
    const loginPage = await loginCtx.newPage();
    await login(loginPage, email, "wrong-password-123");
    await expect(loginPage.getByTestId("login-form").getByRole("alert")).toHaveText("Неверный email или пароль.");
    await login(loginPage, email, NEW_PASSWORD);
    await expect(loginPage).toHaveURL(/\/dashboard/);
    await loginPage.goto("/settings/users");
    await expect(loginPage.getByText("Нет доступа к разделу")).toBeVisible();

    // 6. пользователь меняет собственный пароль в настройках
    await loginPage.goto("/settings");
    const form = loginPage.getByTestId("change-password-form");
    await form.getByLabel("Текущий пароль").fill("not-my-password-1");
    await form.getByLabel("Новый пароль", { exact: true }).fill(NEWER_PASSWORD);
    await form.getByLabel("Повторите новый пароль").fill(NEWER_PASSWORD);
    await form.getByRole("button", { name: "Изменить пароль" }).click();
    await expect(form.getByText("Неверный текущий пароль")).toBeVisible();
    // после ошибки React 19 очищает поля формы с паролями: вводим заново
    await form.getByLabel("Текущий пароль").fill(NEW_PASSWORD);
    await form.getByLabel("Новый пароль", { exact: true }).fill(NEWER_PASSWORD);
    await form.getByLabel("Повторите новый пароль").fill(NEWER_PASSWORD);
    await form.getByRole("button", { name: "Изменить пароль" }).click();
    await expect(loginPage.getByRole("status")).toContainText("Пароль изменён");
    await loginCtx.close();
    const afterCtx = await browser.newContext();
    const afterPage = await afterCtx.newPage();
    await login(afterPage, email, NEW_PASSWORD);
    await expect(afterPage.getByTestId("login-form").getByRole("alert")).toHaveText("Неверный email или пароль.");
    await login(afterPage, email, NEWER_PASSWORD);
    await expect(afterPage).toHaveURL(/\/dashboard/);
    await afterCtx.close();

    // 7. ADMIN отправляет ссылку сброса; пользователь задаёт пароль по ссылке
    await page.reload();
    await page.getByLabel("Поиск по таблице").fill(email);
    await expect(rowOf(page, email)).toContainText("Активен");
    await rowAction(page, name, "Отправить ссылку сброса пароля");
    await expect(notice(page)).toContainText(`Ссылка для сброса пароля отправлена на ${email}`);
    const recovery = await lastMail(request, email, "recovery");
    expect(recovery.count).toBe(1);
    const resetCtx = await browser.newContext();
    const resetPage = await resetCtx.newPage();
    await resetPage.goto(`${baseURL}/auth/confirm?token_hash=${recovery.last!.token}&type=recovery`);
    await expect(resetPage).toHaveURL(/\/auth\/set-password$/);
    await resetPage.getByLabel("Новый пароль").fill(NEW_PASSWORD);
    await resetPage.getByLabel("Повторите пароль").fill(NEW_PASSWORD);
    await resetPage.getByRole("button", { name: "Сохранить пароль и войти" }).click();
    await expect(resetPage).toHaveURL(/\/dashboard/);
    await resetCtx.close();

    // 8. деактивация: подтверждение, вход закрыт
    await rowAction(page, name, "Деактивировать");
    await expect(page.getByRole("alertdialog")).toContainText("потеряет доступ");
    await page.getByRole("alertdialog").getByRole("button", { name: "Отмена" }).click();
    await expect(rowOf(page, email)).toContainText("Активен");
    await rowAction(page, name, "Деактивировать");
    await page.getByRole("alertdialog").getByRole("button", { name: "Деактивировать" }).click();
    await expect(notice(page)).toContainText("Пользователь деактивирован");
    await expect(rowOf(page, email)).toContainText("Деактивирован");
    const blockedCtx = await browser.newContext();
    const blockedPage = await blockedCtx.newPage();
    await login(blockedPage, email, NEW_PASSWORD);
    await expect(blockedPage.getByTestId("login-form").getByRole("alert")).toContainText("заблокирована");
    await blockedCtx.close();
    await page.getByRole("button", { name: `Действия: ${name}` }).click();
    await expect(page.getByRole("menuitem", { name: "Изменить роль" })).toHaveCount(0); // у деактивированного только «Восстановить»
    await page.keyboard.press("Escape");

    // 9. восстановление
    await rowAction(page, name, "Восстановить доступ");
    await expect(notice(page)).toContainText("Доступ восстановлен");
    await expect(rowOf(page, email)).toContainText("Активен");
    const backCtx = await browser.newContext();
    const backPage = await backCtx.newPage();
    await login(backPage, email, NEW_PASSWORD);
    await expect(backPage).toHaveURL(/\/dashboard/);
    await backCtx.close();
  });

  test("ошибки приглашения: дубликат и лимит писем", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await openUsers(page);
    await page.getByRole("button", { name: "Пригласить пользователя" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("ФИО").fill("Дубликат Кадровика");
    await dialog.getByLabel("Email").fill("hr@test.local");
    await dialog.getByRole("button", { name: "Отправить приглашение" }).click();
    await expect(dialog.getByRole("alert")).toContainText("уже зарегистрирован");
    await dialog.getByLabel("Email").fill("ratelimit@test.local");
    await dialog.getByRole("button", { name: "Отправить приглашение" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Слишком много писем");
    await dialog.getByRole("button", { name: "Отмена" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

test.describe("«Забыли пароль?» и ссылки из писем", () => {
  test("со страницы входа: одинаковый ответ для существующего и несуществующего email", async ({ page, request }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Забыли пароль?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    await page.getByRole("button", { name: "Отправить ссылку" }).click();
    await expect(page.getByText("Введите email")).toBeVisible();

    const notice = "Если такой email зарегистрирован, мы отправили на него ссылку для сброса пароля";
    await page.getByLabel("Email").fill("viewer@test.local");
    await page.getByRole("button", { name: "Отправить ссылку" }).click();
    await expect(page.getByRole("status")).toContainText(notice);
    expect((await lastMail(request, "viewer@test.local", "recovery")).count).toBeGreaterThan(0);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("nobody-here@test.local");
    await page.getByRole("button", { name: "Отправить ссылку" }).click();
    await expect(page.getByRole("status")).toContainText(notice);
    expect((await lastMail(request, "nobody-here@test.local", "recovery")).count).toBe(0);

    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill("ratelimit@test.local");
    await page.getByRole("button", { name: "Отправить ссылку" }).click();
    await expect(page.getByTestId("forgot-form").getByRole("alert")).toContainText("Слишком много писем");
  });

  test("недействительные ссылки ведут на страницу ошибки; set-password закрыт для анонима", async ({ page }) => {
    for (const qs of ["token_hash=nope&type=invite", "token_hash=nope&type=recovery", "type=invite", "token_hash=x&type=signup"]) {
      await page.goto(`/auth/confirm?${qs}`);
      await expect(page).toHaveURL(/\/auth\/error$/);
    }
    await page.goto("/auth/set-password");
    await expect(page).toHaveURL(/\/login\?next=%2Fauth%2Fset-password$/);
  });
});
