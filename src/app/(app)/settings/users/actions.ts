"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { createAdminClient, createStatelessClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleKey, getSiteUrl } from "@/lib/env.server";
import { requireAdminActor } from "@/lib/users/guard";
import { findAuthUserByEmail } from "@/lib/users/service";
import { checkChangeRole, checkSetActive, type ProfileLite } from "@/lib/users/policy";
import { ERR, userErrorMessage } from "@/lib/users/errors";
import {
  changeRoleSchema,
  fieldErrorsFrom,
  inviteUserSchema,
  setActiveSchema,
  userIdSchema,
  type ActionResult,
} from "@/lib/users/schemas";
import { isAppRole } from "@/lib/auth/roles";

/** ~100 лет: у Supabase Auth нет «вечной» блокировки, снимается значением "none". */
const BAN_FOREVER = "876000h";
const USERS_PATH = "/settings/users";

const fail = (error: string, fieldErrors?: Record<string, string | undefined>): ActionResult => ({ ok: false, error, fieldErrors });

function adminClientOrError(): { admin: SupabaseClient<Database>; error: null } | { admin: null; error: string } {
  try {
    getServiceRoleKey();
    return { admin: createAdminClient(), error: null };
  } catch {
    return { admin: null, error: ERR.notConfigured };
  }
}

async function loadProfiles() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id, role, is_active");
  if (error) return { error: userErrorMessage(error), profiles: null, supabase } as const;
  const profiles: ProfileLite[] = (data ?? []).filter((p) => isAppRole(p.role)).map((p) => ({ id: p.id, role: p.role, is_active: p.is_active }));
  return { error: null, profiles, supabase } as const;
}

/**
 * Приглашение: Auth Admin API создаёт пользователя и шлёт письмо, затем ADMIN (его сессия, под RLS и аудитом)
 * создаёт строку profiles. Если профиль не создался, только что созданный пользователь Auth удаляется (откат).
 */
export async function inviteUser(input: unknown): Promise<ActionResult> {
  const actor = await requireAdminActor();
  if (!actor.ok) return fail(actor.error);
  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы.", fieldErrorsFrom(parsed.error));
  const { email, fullName, role } = parsed.data;

  const a = adminClientOrError();
  if (a.error !== null) return fail(a.error);

  try {
    const supabase = await createClient();

    const existing = await findAuthUserByEmail(email);
    let preExisting = false;
    if (existing) {
      const { data: profile } = await supabase.from("profiles").select("id").eq("id", existing.id).maybeSingle();
      const confirmed = Boolean(existing.email_confirmed_at ?? existing.confirmed_at);
      if (profile || confirmed) return fail(ERR.exists, { email: ERR.exists });
      preExisting = true; // осиротевшее неподтверждённое приглашение: переиспользуем, но при откате не удаляем
    }

    const { data: invited, error: inviteError } = await a.admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${getSiteUrl()}/auth/confirm`,
      data: { full_name: fullName }, // только отображаемое имя; роль из user_metadata не читается нигде
    });
    if (inviteError || !invited?.user) return fail(userErrorMessage(inviteError), inviteError?.code === "email_exists" ? { email: ERR.exists } : undefined);

    const { error: profileError } = await supabase.from("profiles").insert({ id: invited.user.id, full_name: fullName, role });
    if (profileError) {
      if (!preExisting) {
        const { error: rollbackError } = await a.admin.auth.admin.deleteUser(invited.user.id);
        if (rollbackError) {
          console.error("[users] откат приглашения не удался", { userId: invited.user.id, code: rollbackError.code });
          return fail(`${userErrorMessage(profileError)} Пользователь создан в Auth без профиля и не удалён автоматически: удалите его вручную в Supabase (Authentication → Users).`);
        }
      }
      return fail(userErrorMessage(profileError));
    }
    revalidatePath(USERS_PATH);
    return { ok: true, message: `Приглашение отправлено на ${email}.` };
  } catch (e) {
    console.error("[users] inviteUser", e instanceof Error ? e.message : e);
    return fail(ERR.unavailable);
  }
}

export async function changeRole(input: unknown): Promise<ActionResult> {
  const actor = await requireAdminActor();
  if (!actor.ok) return fail(actor.error);
  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте данные.", fieldErrorsFrom(parsed.error));
  const { userId, role } = parsed.data;
  if (userId === actor.actorId) return fail(ERR.self);

  try {
    const loaded = await loadProfiles();
    if (loaded.error !== null) return fail(loaded.error);
    const target = loaded.profiles.find((p) => p.id === userId);
    if (!target) return fail(ERR.notFound);
    const verdict = checkChangeRole({ actorId: actor.actorId, target, newRole: role, all: loaded.profiles });
    if (!verdict.ok) return fail(verdict.error);

    const { data, error } = await loaded.supabase.from("profiles").update({ role }).eq("id", userId).select("id");
    if (error) return fail(userErrorMessage(error));
    if (!data?.length) return fail(ERR.forbidden);
    revalidatePath(USERS_PATH);
    return { ok: true, message: "Роль изменена." };
  } catch (e) {
    console.error("[users] changeRole", e instanceof Error ? e.message : e);
    return fail(ERR.unavailable);
  }
}

/**
 * Деактивация: profiles.is_active = false (доступ закрывается сразу через app_role()/RLS) и блокировка в Auth,
 * чтобы refresh-токены перестали выдавать новые JWT. Восстановление: снять блокировку, затем is_active = true.
 */
export async function setUserActive(input: unknown): Promise<ActionResult> {
  const actor = await requireAdminActor();
  if (!actor.ok) return fail(actor.error);
  const parsed = setActiveSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте данные.", fieldErrorsFrom(parsed.error));
  const { userId, active } = parsed.data;
  if (userId === actor.actorId) return fail(ERR.self);

  const a = adminClientOrError();
  if (a.error !== null) return fail(a.error);

  try {
    const loaded = await loadProfiles();
    if (loaded.error !== null) return fail(loaded.error);
    const target = loaded.profiles.find((p) => p.id === userId);
    if (!target) return fail(ERR.notFound);
    const verdict = checkSetActive({ actorId: actor.actorId, target, active, all: loaded.profiles });
    if (!verdict.ok) return fail(verdict.error);

    if (active) {
      const { error: unbanError } = await a.admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
      if (unbanError) return fail(userErrorMessage(unbanError));
    }
    const { data, error } = await loaded.supabase.from("profiles").update({ is_active: active }).eq("id", userId).select("id");
    if (error) return fail(userErrorMessage(error));
    if (!data?.length) return fail(ERR.forbidden);

    if (!active) {
      const { error: banError } = await a.admin.auth.admin.updateUserById(userId, { ban_duration: BAN_FOREVER });
      if (banError) {
        console.error("[users] блокировка в Auth не удалась", { userId, code: banError.code });
        revalidatePath(USERS_PATH);
        return { ok: true, message: "Пользователь деактивирован: доступ к данным закрыт. Блокировку входа в Auth применить не удалось." };
      }
    }
    revalidatePath(USERS_PATH);
    return { ok: true, message: active ? "Доступ восстановлен." : "Пользователь деактивирован." };
  } catch (e) {
    console.error("[users] setUserActive", e instanceof Error ? e.message : e);
    return fail(ERR.unavailable);
  }
}

export async function resendInvite(input: unknown): Promise<ActionResult> {
  const actor = await requireAdminActor();
  if (!actor.ok) return fail(actor.error);
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте данные.");
  const a = adminClientOrError();
  if (a.error !== null) return fail(a.error);

  try {
    const supabase = await createClient();
    const { data: profile } = await supabase.from("profiles").select("id, is_active").eq("id", parsed.data.userId).maybeSingle();
    if (!profile) return fail(ERR.notFound);
    if (!profile.is_active) return fail(ERR.inactive);

    const { data: got, error: getError } = await a.admin.auth.admin.getUserById(parsed.data.userId);
    if (getError || !got?.user?.email) return fail(getError ? userErrorMessage(getError) : ERR.notFound);
    if (got.user.email_confirmed_at ?? got.user.confirmed_at) return fail(ERR.alreadyConfirmed);

    const { error } = await a.admin.auth.admin.inviteUserByEmail(got.user.email, { redirectTo: `${getSiteUrl()}/auth/confirm` });
    if (error) return fail(userErrorMessage(error));
    revalidatePath(USERS_PATH);
    return { ok: true, message: `Приглашение отправлено повторно на ${got.user.email}.` };
  } catch (e) {
    console.error("[users] resendInvite", e instanceof Error ? e.message : e);
    return fail(ERR.unavailable);
  }
}

/** Ссылка восстановления: письмо отправляет Supabase Auth (resetPasswordForEmail, без сессии); email берём из Auth Admin API. */
export async function sendPasswordReset(input: unknown): Promise<ActionResult> {
  const actor = await requireAdminActor();
  if (!actor.ok) return fail(actor.error);
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте данные.");
  const a = adminClientOrError();
  if (a.error !== null) return fail(a.error);

  try {
    const supabase = await createClient();
    const { data: profile } = await supabase.from("profiles").select("id, is_active").eq("id", parsed.data.userId).maybeSingle();
    if (!profile) return fail(ERR.notFound);
    if (!profile.is_active) return fail(ERR.inactive);

    const { data: got, error: getError } = await a.admin.auth.admin.getUserById(parsed.data.userId);
    if (getError || !got?.user?.email) return fail(getError ? userErrorMessage(getError) : ERR.notFound);

    const { error } = await createStatelessClient().auth.resetPasswordForEmail(got.user.email, { redirectTo: `${getSiteUrl()}/auth/confirm` });
    if (error) return fail(userErrorMessage(error));
    return { ok: true, message: `Ссылка для сброса пароля отправлена на ${got.user.email}.` };
  } catch (e) {
    console.error("[users] sendPasswordReset", e instanceof Error ? e.message : e);
    return fail(ERR.unavailable);
  }
}
