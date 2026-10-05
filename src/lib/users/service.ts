import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isAppRole } from "@/lib/auth/roles";
import { userStatus } from "./policy";
import type { UserRow } from "./types";

export type { UserRow };

const PER_PAGE = 200;
const MAX_PAGES = 25;

/** Все пользователи Auth (email, даты приглашения/подтверждения/входа живут только там). */
export async function listAuthUsers(): Promise<User[]> {
  const admin = createAdminClient();
  const all: User[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    all.push(...data.users);
    if (data.users.length < PER_PAGE) break;
  }
  return all;
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const needle = email.trim().toLowerCase();
  return (await listAuthUsers()).find((u) => u.email?.toLowerCase() === needle) ?? null;
}

/**
 * Таблица пользователей: profiles читаем сессией ADMIN (под RLS), email и даты берём из Auth Admin API.
 * Роль — из profiles.role, то есть из той же таблицы, которую читает app_role().
 */
export async function listUserRows(): Promise<UserRow[]> {
  const supabase = await createClient();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;

  const authUsers = new Map((await listAuthUsers()).map((u) => [u.id, u]));
  return (profiles ?? [])
    .filter((p) => isAppRole(p.role))
    .map((p) => {
      const a = authUsers.get(p.id);
      const confirmedAt = a?.email_confirmed_at ?? a?.confirmed_at ?? null;
      return {
        id: p.id,
        fullName: p.full_name,
        email: a?.email ?? null,
        role: p.role,
        isActive: p.is_active,
        status: userStatus({ isActive: p.is_active, confirmedAt }),
        invitedAt: a?.invited_at ?? null,
        confirmedAt,
        lastSignInAt: a?.last_sign_in_at ?? null,
        createdAt: p.created_at,
      };
    });
}
