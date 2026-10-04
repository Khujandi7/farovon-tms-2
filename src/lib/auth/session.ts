import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type AppRole, type SectionId, canAccessSection, isAppRole } from "@/lib/auth/roles";

export type SessionContext =
  | { status: "anonymous" }
  | { status: "no_access"; userId: string; email: string | null }
  | { status: "ok"; userId: string; email: string | null; role: AppRole; fullName: string };

/**
 * Текущий пользователь и его роль. Роль берётся из БД функцией app_role() — той же, что использует RLS:
 * нет профиля или profiles.is_active = false → роли нет → нет доступа. Роль из JWT/user_metadata не читается.
 * Кэшируется на время одного запроса.
 */
export const getSession = cache(async (): Promise<SessionContext> => {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (claimsError || !claims?.sub) return { status: "anonymous" };

  const userId = claims.sub;
  const email = typeof claims.email === "string" ? claims.email : null;

  const { data: role, error: roleError } = await supabase.rpc("app_role");
  if (roleError) throw new Error(`Не удалось определить роль пользователя: ${roleError.message}`);
  if (!isAppRole(role)) return { status: "no_access", userId, email };

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).maybeSingle();

  return { status: "ok", userId, email, role, fullName: profile?.full_name ?? email ?? "Пользователь" };
});

/** Для закрытых страниц: аноним уходит на /login. */
export async function requireSession(): Promise<Exclude<SessionContext, { status: "anonymous" }>> {
  const session = await getSession();
  if (session.status === "anonymous") redirect("/login");
  return session;
}

export type SectionAccess =
  | { allowed: true; session: Extract<SessionContext, { status: "ok" }> }
  | { allowed: false; session: Exclude<SessionContext, { status: "anonymous" }> };

export async function getSectionAccess(section: SectionId): Promise<SectionAccess> {
  const session = await requireSession();
  if (session.status === "ok" && canAccessSection(session.role, section)) return { allowed: true, session };
  return { allowed: false, session };
}
