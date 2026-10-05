"use server";

import { createStatelessClient } from "@/lib/supabase/admin";
import { getSiteUrl } from "@/lib/env.server";
import { fieldErrorsFrom, forgotPasswordSchema, type FormState } from "@/lib/users/schemas";
import { ERR, FORGOT_PASSWORD_NOTICE, userErrorMessage } from "@/lib/users/errors";

/**
 * Самостоятельное восстановление пароля. Ответ не зависит от того, есть ли такой email (нет перебора адресов).
 * Только лимит писем показываем явно: он не раскрывает существование учётной записи.
 */
export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };
  try {
    const { error } = await createStatelessClient().auth.resetPasswordForEmail(parsed.data.email, { redirectTo: `${getSiteUrl()}/auth/confirm` });
    if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || error.status === 429)) {
      return { error: ERR.rateLimit };
    }
    if (error && (!error.status || error.status >= 500)) return { error: userErrorMessage(error) };
  } catch {
    return { error: ERR.unavailable };
  }
  return { ok: true, message: FORGOT_PASSWORD_NOTICE };
}
