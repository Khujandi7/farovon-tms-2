import "server-only";

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
