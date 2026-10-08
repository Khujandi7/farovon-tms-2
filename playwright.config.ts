import { generateKeyPairSync } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// E2E-тесты не требуют настоящего Supabase: приложение подключается к локальному mock-серверу
// (e2e/mock-supabase.mjs), который имитирует Auth и PostgREST с тестовыми данными.
// PW_CHROMIUM_PATH — путь к локально установленному Chromium, если версия браузера Playwright не скачана.
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;
// Тестовый сервисный аккаунт Google: ключ создаётся на лету и нигде не хранится; настоящих учётных данных здесь нет.
const testKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const googleJson = JSON.stringify({ client_email: "tms-sync@e2e-test.iam.gserviceaccount.com", private_key: testKey });
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], launchOptions: { executablePath } } },
    { name: "mobile", use: { ...devices["Pixel 7"], launchOptions: { executablePath } } },
  ],
  webServer: [
    {
      command: "node e2e/mock-supabase-server.mjs",
      env: { E2E_SERVICE_ROLE_KEY: "e2e-service-role-key" },
      url: "http://127.0.0.1:54399/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      // Сборка должна быть сделана с теми же NEXT_PUBLIC_* (npm run test:e2e:build)
      command: `npx next start -p ${port}`,
      url: `http://127.0.0.1:${port}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        NO_PROXY: "localhost,127.0.0.1",
        no_proxy: "localhost,127.0.0.1",
        // Только для mock-сервера: настоящего ключа здесь нет
        SUPABASE_SERVICE_ROLE_KEY: "e2e-service-role-key",
        NEXT_PUBLIC_SITE_URL: `http://127.0.0.1:${port}`,
        // Google Sheets: сервисный аккаунт и «Google» — mock-сервер (см. e2e/mock-phase3b.mjs)
        GOOGLE_SERVICE_ACCOUNT_JSON: googleJson,
        GOOGLE_SHEETS_API_BASE: "http://127.0.0.1:54399/__google",
        GOOGLE_OAUTH_TOKEN_URL: "http://127.0.0.1:54399/__google/token",
      },
    },
  ],
});
