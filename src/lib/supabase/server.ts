import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";

/**
 * Клиент Supabase для серверных компонентов, Server Actions и Route Handlers.
 * Работает от имени вошедшего пользователя (JWT из cookie) — все запросы проходят через RLS.
 * Создавайте новый клиент на каждый запрос, не храните в глобальных переменных.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();
  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Вызов из серверного компонента: cookie нельзя записать. Сессию обновляет proxy.ts.
        }
      },
    },
  });
}
