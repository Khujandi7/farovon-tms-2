"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema, type LoginState } from "@/lib/auth/schemas";
import { authErrorMessage, NO_ROLE_MESSAGE } from "@/lib/auth/errors";
import { safeNextPath } from "@/lib/auth/routes";
import { isAppRole } from "@/lib/auth/roles";

/**
 * Вход по email и паролю. Регистрации нет: учётные записи создаёт администратор.
 * После входа роль проверяется в БД (app_role()); без активной роли сессия сразу закрывается.
 */
export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  const email = typeof formData.get("email") === "string" ? String(formData.get("email")) : "";

  if (!parsed.success) {
    const fieldErrors: LoginState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === "email" || key === "password") && !fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { fieldErrors, email };
  }

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return { error: "Приложение не настроено: не заданы параметры подключения к Supabase.", email };
  }

  let signInError: Parameters<typeof authErrorMessage>[0] = null;
  try {
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    signInError = error;
  } catch {
    return { error: "Сервис авторизации недоступен. Попробуйте позже.", email };
  }
  if (signInError) return { error: authErrorMessage(signInError), email };

  const { data: role, error: roleError } = await supabase.rpc("app_role");
  if (roleError || !isAppRole(role)) {
    await supabase.auth.signOut();
    return { error: roleError ? "Не удалось проверить роль. Попробуйте позже." : NO_ROLE_MESSAGE, email };
  }

  redirect(safeNextPath(parsed.data.next));
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } finally {
    redirect("/login");
  }
}
