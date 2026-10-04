import { expect, test } from "@playwright/test";
import { signInAs } from "./helpers";

test.describe("защита маршрутов", () => {
  test("корень и закрытые страницы ведут на вход", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/budget?year=2025");
    await expect(page).toHaveURL(/\/login\?next=%2Fbudget%3Fyear%3D2025$/);
  });

  for (const path of ["/dashboard", "/trainings", "/employees", "/feedback", "/reports", "/data-quality", "/settings", "/no-such-page"]) {
    test(`аноним не видит ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login/);
    });
  }

  test("внешний next не принимается", async ({ page }) => {
    await page.goto("/login?next=https://evil.example");
    await expect(page.locator('input[name="next"]')).toHaveValue("/dashboard");
  });
});

test.describe("вход", () => {
  test("страница входа: только вход, без регистрации", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Вход в FAROVON TMS" })).toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
    await expect(page.getByLabel("Пароль")).toBeVisible();
    await expect(page.getByRole("link", { name: /регистр/i })).toHaveCount(0);
  });

  test("пустая форма: ошибки полей", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByText("Введите email")).toBeVisible();
    await expect(page.getByText("Введите пароль")).toBeVisible();
  });

  test("неверный пароль: понятное сообщение", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("admin@test.local");
    await page.getByLabel("Пароль").fill("wrong-password");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByTestId("login-form").getByRole("alert")).toHaveText("Неверный email или пароль.");
  });

  test("пользователь без роли не входит", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("norole@test.local");
    await page.getByLabel("Пароль").fill("test-password");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page.getByTestId("login-form").getByRole("alert")).toContainText("не назначена роль");
    await expect(page).toHaveURL(/\/login/);
  });

  test("успешный вход ведёт на запрошенную страницу, выход — на вход", async ({ page }) => {
    await page.goto("/trainings");
    await expect(page).toHaveURL(/\/login\?next=%2Ftrainings/);
    await page.getByLabel("Email").fill("admin@test.local");
    await page.getByLabel("Пароль").fill("test-password");
    await page.getByRole("button", { name: "Войти" }).click();
    await expect(page).toHaveURL(/\/trainings$/);
    await expect(page.getByRole("heading", { name: "Обучения" })).toBeVisible();

    await page.getByTestId("user-menu").click();
    await page.getByTestId("sign-out").click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
  });

  test("вошедший пользователь со страницы входа попадает на дашборд", async ({ page, context, baseURL }) => {
    await signInAs(context, "admin@test.local", baseURL!);
    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

test("заголовки безопасности", async ({ request }) => {
  const res = await request.get("/login");
  expect(res.headers()["x-frame-options"]).toBe("DENY");
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");
  expect(res.headers()["x-powered-by"]).toBeUndefined();
});
