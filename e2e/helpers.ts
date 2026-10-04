import type { BrowserContext } from "@playwright/test";
// @ts-expect-error — JS-модуль mock-сервера без типов
import { sessionFor } from "./mock-supabase.mjs";

export const MOCK_URL = "http://localhost:54399";

/** Кладёт в браузер cookie сессии Supabase в формате @supabase/ssr (base64-<json>). */
export async function signInAs(context: BrowserContext, email: string, baseURL: string) {
  const session = sessionFor(email);
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  await context.addCookies([{ name: "sb-localhost-auth-token", value, url: baseURL, httpOnly: false, sameSite: "Lax" }]);
}
