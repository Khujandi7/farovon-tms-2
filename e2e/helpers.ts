import type { BrowserContext } from "@playwright/test";
// @ts-expect-error — JS-модуль mock-сервера без типов
import { sessionFor } from "./mock-supabase.mjs";

export const MOCK_URL = "http://localhost:54399";

/** Кладёт в браузер cookie сессии Supabase в формате @supabase/ssr (base64-<json>). */
export async function signInAs(context: BrowserContext, email: string, baseURL: string): Promise<string> {
  const session = sessionFor(email);
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  await context.addCookies([{ name: "sb-localhost-auth-token", value, url: baseURL, httpOnly: false, sameSite: "Lax" }]);
  // Состояние mock изолировано по сессии входа: возвращаем её id, чтобы тест мог прочитать свой аудит (/__mock/audit?sid=…).
  return JSON.parse(Buffer.from(session.access_token.split(".")[1], "base64url").toString()).session_id as string;
}
