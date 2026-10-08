import "server-only";
import { resolveHashSecret } from "@/lib/portal/client-hash";

/**
 * Секретные переменные. Модуль помечен server-only: импорт в клиентский компонент ломает сборку.
 * Ключ service_role нужен только серверным операциям администратора (Phase 2.2: приглашение, блокировка).
 * Никогда не называйте его NEXT_PUBLIC_*: такие переменные попадают в браузер.
 */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY не задан (нужен только серверным операциям администратора)");
  return key;
}

/** Адрес приложения для ссылок в письмах Auth (должен входить в Redirect URLs проекта Supabase). */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** Секрет хэширования клиента публичного портала (псевдонимизация IP для лимита частоты). Производный от service_role, если свой не задан. */
export function getPublicRequestHashSecret(): string {
  return resolveHashSecret({ PUBLIC_REQUEST_HASH_SECRET: process.env.PUBLIC_REQUEST_HASH_SECRET, DERIVE_FROM: process.env.SUPABASE_SERVICE_ROLE_KEY });
}

/**
 * Сервисный аккаунт Google для чтения корпоративных таблиц (Phase 3B). Только сервер.
 * GOOGLE_SERVICE_ACCOUNT_JSON — JSON-ключ сервисного аккаунта целиком или в base64. Таблицу открывают этому аккаунту на «Просмотр».
 * Адреса API переопределяются только для тестов (mock); в Production не задаются.
 */
export type GoogleServiceAccount = { clientEmail: string; privateKey: string };
export function getGoogleServiceAccount(): GoogleServiceAccount | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return null;
  try {
    const text = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const j = JSON.parse(text) as { client_email?: unknown; private_key?: unknown };
    if (typeof j.client_email !== "string" || typeof j.private_key !== "string" || !j.private_key.includes("PRIVATE KEY")) return null;
    return { clientEmail: j.client_email, privateKey: j.private_key.replace(/\\n/g, "\n") };
  } catch {
    return null;
  }
}
export function getGoogleApiUrls(): { sheets: string; token: string } {
  return {
    sheets: (process.env.GOOGLE_SHEETS_API_BASE?.trim() || "https://sheets.googleapis.com").replace(/\/+$/, ""),
    token: process.env.GOOGLE_OAUTH_TOKEN_URL?.trim() || "https://oauth2.googleapis.com/token",
  };
}
