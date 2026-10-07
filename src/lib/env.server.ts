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
