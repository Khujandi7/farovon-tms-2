import "server-only";

/**
 * Секретные переменные. Модуль помечен server-only: импорт в клиентский компонент ломает сборку.
 * В Phase 2.1 service_role не используется; понадобится для приглашения пользователей (Phase 2.2).
 */
export function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY не задан (нужен только серверным операциям администратора)");
  return key;
}
