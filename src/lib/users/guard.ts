import "server-only";
import { getSession } from "@/lib/auth/session";
import { canManageUsers } from "./policy";
import { ERR } from "./errors";

export type AdminActor = { ok: true; actorId: string } | { ok: false; error: string };

/** Роль берётся из БД (app_role()), не из JWT/user_metadata. Неактивный ADMIN роли не имеет. */
export async function requireAdminActor(): Promise<AdminActor> {
  let session;
  try {
    session = await getSession();
  } catch {
    return { ok: false, error: ERR.unavailable };
  }
  if (session.status !== "ok" || !canManageUsers(session.role)) return { ok: false, error: ERR.forbidden };
  return { ok: true, actorId: session.userId };
}
