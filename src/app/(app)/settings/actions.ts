"use server";

import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema, fieldErrorsFrom, type FormState } from "@/lib/users/schemas";
import { ERR, userErrorMessage } from "@/lib/users/errors";

/** Смена собственного пароля: сначала проверяем текущий, затем updateUser. Роль и статус не затрагиваются. */
export async function changeOwnPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = changePasswordSchema.safeParse({
    current: formData.get("current"),
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
    if (!data?.claims?.sub || !email) return { error: "Сессия устарела. Войдите снова." };

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: parsed.data.current });
    if (verifyError) {
      return verifyError.code === "invalid_credentials" || verifyError.status === 400
        ? { fieldErrors: { current: "Неверный текущий пароль" } }
        : { error: userErrorMessage(verifyError) };
    }
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) return { error: userErrorMessage(error) };
    return { ok: true, message: "Пароль изменён." };
  } catch {
    return { error: ERR.unavailable };
  }
}
