import "server-only";
import type { Database } from "@/types/database";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import type { AppRole } from "@/lib/auth/roles";
import { WF_ERR, workflowErrorMessage } from "./errors";

type Fns = Database["public"]["Functions"];

export type Fail = { ok: false; error: string; fieldErrors?: Record<string, string | undefined> };
export type Done<T = undefined> = { ok: true; message?: string; data: T };
export type Result<T = undefined> = Done<T> | Fail;

export const fail = (error: string, fieldErrors?: Record<string, string | undefined>): Fail => ({ ok: false, error, fieldErrors });

/**
 * Роль берётся из БД (app_role()), не из JWT. Это ранняя проверка ради понятного сообщения:
 * настоящая защита — проверка роли внутри RPC и RLS.
 */
export async function requireRole(roles: readonly AppRole[]): Promise<{ ok: true; userId: string; role: AppRole } | Fail> {
  try {
    const session = await getSession();
    if (session.status !== "ok" || !roles.includes(session.role)) return fail(WF_ERR.forbidden);
    return { ok: true, userId: session.userId, role: session.role };
  } catch {
    return fail(WF_ERR.unavailable);
  }
}

/** Вызов RPC под сессией пользователя (RLS и аудит видят настоящего автора). service_role здесь не используется. */
export async function callRpc<N extends keyof Fns>(name: N, args: Fns[N]["Args"]): Promise<Result<Fns[N]["Returns"]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc(name, args as never);
    if (error) return fail(workflowErrorMessage(error));
    return { ok: true, data: data as Fns[N]["Returns"] };
  } catch (e) {
    console.error(`[workflow] ${String(name)}`, e instanceof Error ? e.message : e);
    return fail(WF_ERR.unavailable);
  }
}
