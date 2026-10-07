"use server";

import { APP_ROLES } from "@/lib/auth/roles";
import type { SearchRow } from "@/lib/portal/search";
import { callRpc, requireRole, type Result } from "@/lib/workflows/server";

/** Глобальный поиск под правами пользователя: RLS внутри global_search скрывает недоступное роли. */
export async function globalSearch(query: string): Promise<Result<SearchRow[]>> {
  const actor = await requireRole(APP_ROLES);
  if (!actor.ok) return actor;
  const q = typeof query === "string" ? query.trim().slice(0, 100) : "";
  if (q.length < 2) return { ok: true, data: [] };
  const res = await callRpc("global_search", { p_q: q, p_limit: 8 });
  if (!res.ok) return res;
  return { ok: true, data: res.data as SearchRow[] };
}
