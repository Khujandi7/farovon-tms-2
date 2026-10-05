"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFrom, setPasswordSchema, type FormState } from "@/lib/users/schemas";
import { ERR, userErrorMessage } from "@/lib/users/errors";
import { NO_ROLE_MESSAGE } from "@/lib/auth/errors";
import { isAppRole } from "@/lib/auth/roles";

/**
 * Пользователь, пришедший по ссылке из письма (/auth/confirm создал сессию), задаёт собственный пароль.
 * Роль и is_active здесь не затрагиваются: их меняет только ADMIN.
 */
export async function setPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = setPasswordSchema.safeParse({ password: formData.get("password"), confirm: formData.get("confirm") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return { error: ERR.unavailable };
  }

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { error: "Сессия не найдена. Откройте ссылку из письма ещё раз или запросите новую." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: userErrorMessage(error) };

  const { data: role, error: roleError } = await supabase.rpc("app_role");
  if (roleError || !isAppRole(role)) {
    await supabase.auth.signOut();
    return { error: roleError ? ERR.unavailable : NO_ROLE_MESSAGE };
  }
  redirect("/dashboard");
}
