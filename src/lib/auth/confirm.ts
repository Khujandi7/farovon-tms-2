import type { EmailOtpType } from "@supabase/supabase-js";

/** Разрешены только типы писем, которые рассылает приложение: приглашение и восстановление пароля. */
export const CONFIRM_TYPES = ["invite", "recovery"] as const satisfies readonly EmailOtpType[];
export type ConfirmType = (typeof CONFIRM_TYPES)[number];
/** Куда всегда ведёт успешное подтверждение (параметр next не принимается: нет открытого редиректа). */
export const SET_PASSWORD_PATH = "/auth/set-password";

export function parseConfirmParams(params: URLSearchParams): { tokenHash: string; type: ConfirmType } | null {
  const tokenHash = params.get("token_hash");
  const type = params.get("type");
  if (!tokenHash || tokenHash.length > 512 || !type) return null;
  if (!(CONFIRM_TYPES as readonly string[]).includes(type)) return null;
  return { tokenHash, type: type as ConfirmType };
}
