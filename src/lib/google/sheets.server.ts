import "server-only";
import crypto from "node:crypto";
import { getGoogleApiUrls, getGoogleServiceAccount, type GoogleServiceAccount } from "@/lib/env.server";

/**
 * Чтение Google Sheets на сервере через Sheets API v4 и сервисный аккаунт (OAuth 2.0 JWT bearer, RS256).
 * Ключ и токен доступа в браузер не попадают; права — только чтение (spreadsheets.readonly).
 * Приватная корпоративная таблица доступна, если её открыли сервисному аккаунту (Поделиться → email аккаунта → Читатель).
 */
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const TIMEOUT_MS = 20_000;
export const MAX_SHEET_ROWS = 5050;

export type SheetTab = { sheetId: number; title: string; rows: number; columns: number };
export type SheetMeta = { title: string; tabs: SheetTab[] };
export type GoogleResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

let cached: { token: string; exp: number; email: string } | null = null;

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** JWT для обмена на токен доступа (экспортируется для теста подписи). */
export function buildAssertion(sa: GoogleServiceAccount, aud: string, now = Math.floor(Date.now() / 1000)): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.clientEmail, scope: SCOPE, aud, iat: now, exp: now + 3600 }));
  const sig = crypto.createSign("RSA-SHA256").update(`${head}.${claims}`).sign(sa.privateKey);
  return `${head}.${claims}.${b64url(sig)}`;
}

export function googleConfigured(): { configured: boolean; serviceAccountEmail: string | null } {
  const sa = getGoogleServiceAccount();
  return { configured: !!sa, serviceAccountEmail: sa?.clientEmail ?? null };
}

const notConfigured = "Доступ к Google Sheets не настроен: администратору нужно задать GOOGLE_SERVICE_ACCOUNT_JSON на сервере (см. docs/DEPLOYMENT.md).";

async function accessToken(): Promise<GoogleResult<string>> {
  const sa = getGoogleServiceAccount();
  if (!sa) return { ok: false, error: notConfigured };
  if (cached && cached.email === sa.clientEmail && cached.exp > Date.now() + 60_000) return { ok: true, data: cached.token };
  const { token: url } = getGoogleApiUrls();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: buildAssertion(sa, url) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const j = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !j.access_token) return { ok: false, error: "Google отклонил ключ сервисного аккаунта. Проверьте GOOGLE_SERVICE_ACCOUNT_JSON.", status: res.status };
    cached = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000, email: sa.clientEmail };
    return { ok: true, data: j.access_token };
  } catch {
    return { ok: false, error: "Google недоступен. Попробуйте позже." };
  }
}

async function getJson<T>(path: string): Promise<GoogleResult<T>> {
  const tok = await accessToken();
  if (!tok.ok) return tok;
  const sa = getGoogleServiceAccount();
  try {
    const res = await fetch(`${getGoogleApiUrls().sheets}${path}`, { headers: { authorization: `Bearer ${tok.data}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (res.ok) return { ok: true, data: (await res.json()) as T };
    if (res.status === 401) cached = null;
    if (res.status === 403) return { ok: false, status: 403, error: `Нет доступа к таблице. Откройте её сервисному аккаунту ${sa?.clientEmail ?? ""} с правом «Читатель» и повторите.` };
    if (res.status === 404) return { ok: false, status: 404, error: "Таблица не найдена. Проверьте ссылку." };
    if (res.status === 400) return { ok: false, status: 400, error: "Лист не найден или диапазон недоступен." };
    if (res.status === 429) return { ok: false, status: 429, error: "Слишком много запросов к Google. Повторите через минуту." };
    return { ok: false, status: res.status, error: "Google вернул ошибку. Попробуйте позже." };
  } catch {
    return { ok: false, error: "Google недоступен. Попробуйте позже." };
  }
}

export async function getSpreadsheetMeta(spreadsheetId: string): Promise<GoogleResult<SheetMeta>> {
  const r = await getJson<{ properties?: { title?: string }; sheets?: { properties?: { sheetId?: number; title?: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[] }>(
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=${encodeURIComponent("properties.title,sheets.properties(sheetId,title,gridProperties(rowCount,columnCount))")}`,
  );
  if (!r.ok) return r;
  const tabs = (r.data.sheets ?? [])
    .map((s) => s.properties)
    .filter((p): p is NonNullable<typeof p> => !!p && typeof p.title === "string")
    .map((p) => ({ sheetId: p.sheetId ?? 0, title: p.title!, rows: p.gridProperties?.rowCount ?? 0, columns: p.gridProperties?.columnCount ?? 0 }));
  return { ok: true, data: { title: r.data.properties?.title ?? "Google-таблица", tabs } };
}

/** Значения листа как матрица строк (форматированные, как видит пользователь: даты и номера с ведущими нулями не искажаются). */
export async function getSheetValues(spreadsheetId: string, tab: string): Promise<GoogleResult<string[][]>> {
  const range = `'${tab.replace(/'/g, "''")}'!A1:BH${MAX_SHEET_ROWS}`;
  const r = await getJson<{ values?: unknown[][] }>(
    `/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`,
  );
  if (!r.ok) return r;
  return { ok: true, data: (r.data.values ?? []).map((row) => row.map((c) => (c === null || c === undefined ? "" : String(c)))) };
}

/** Только для тестов. */
export function __resetGoogleTokenCache() {
  cached = null;
}
