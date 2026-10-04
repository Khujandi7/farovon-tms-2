import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Клиент Supabase для браузера (клиентские компоненты, Realtime). Использует только публичный ключ. */
export function createClient() {
  if (!browserClient) {
    const env = getPublicEnv();
    browserClient = createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  }
  return browserClient;
}
