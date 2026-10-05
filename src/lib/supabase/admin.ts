import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";
import { getServiceRoleKey } from "@/lib/env.server";

/**
 * Клиент с ключом service_role: обходит RLS. Только для Auth Admin API (приглашение, блокировка, чтение
 * email/последнего входа). ЗАПРЕЩЕНО использовать для записи в таблицы: audit_log тогда не узнает автора
 * (auth.uid() = NULL), а RLS не сработает. Данные пишем клиентом из @/lib/supabase/server (сессия ADMIN).
 * Модуль помечен server-only: импорт из клиентского кода ломает сборку. Сессия не сохраняется.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const env = getPublicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/**
 * Анонимный (publishable) клиент без сессии: для писем восстановления пароля, которые Supabase отправляет
 * от имени публичного API. Не обходит RLS и не содержит секретов.
 */
export function createStatelessClient(): SupabaseClient<Database> {
  const env = getPublicEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
