"use server";

import { headers } from "next/headers";
import { fieldErrorsFrom } from "@/lib/users/schemas";
import { computeClientHash, pickClientIp } from "@/lib/portal/client-hash";
import { getPublicRequestHashSecret } from "@/lib/env.server";
import { verifyCaptcha } from "@/lib/portal/captcha";
import { MAX_PAYLOAD_CHARS, isValidTokenFormat, parseRequestCode, publicSubmitSchema } from "@/lib/portal/schemas";
import { callSubmitPublicRequest } from "@/lib/supabase/service-rpc";
import type { Json } from "@/types/database";

export type PublicSubmitResult =
  | { ok: true; code: string | null }
  | { ok: false; kind: "closed" | "rate" | "invalid" | "error"; error: string; fieldErrors?: Record<string, string | undefined> };

const GENERIC = "Не удалось отправить заявку. Попробуйте позже.";

/**
 * Публичная отправка заявки (без входа). Защита: honeypot, размер, Zod, CAPTCHA-хук, HMAC-хэш клиента.
 * В БД уходит только хэш клиента; IP и User-Agent не сохраняются. Все проверки доступа и лимиты — в submit_public_request.
 */
export async function submitPublicRequest(input: { token: string | null; values: unknown }): Promise<PublicSubmitResult> {
  const token = input.token ? input.token : null;
  if (token !== null && !isValidTokenFormat(token)) return { ok: false, kind: "closed", error: "Ссылка недействительна." };

  let size = Infinity;
  try {
    size = JSON.stringify(input.values ?? null).length;
  } catch {
    /* не сериализуется — отклоняем ниже */
  }
  if (size > MAX_PAYLOAD_CHARS) return { ok: false, kind: "invalid", error: "Слишком большой объём данных." };

  const parsed = publicSubmitSchema.safeParse(input.values);
  if (!parsed.success) {
    return { ok: false, kind: "invalid", error: "Проверьте поля формы.", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { website, captcha_token, ...values } = parsed.data;

  // Honeypot: бот заполнил скрытое поле. Отвечаем «успехом» без записи, чтобы не подсказывать обход.
  if (website && website.trim() !== "") return { ok: true, code: null };

  const h = await headers();
  const ip = pickClientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const captcha = await verifyCaptcha(captcha_token, ip);
  if (!captcha.ok) return { ok: false, kind: "error", error: "Не удалось подтвердить, что вы не робот. Обновите страницу." };

  const hash = computeClientHash(ip, h.get("user-agent") ?? "", getPublicRequestHashSecret());
  const res = await callSubmitPublicRequest(token, values as unknown as Json, hash);
  if (res.ok) return { ok: true, code: parseRequestCode(res.data) };

  if (res.code === "P0018") return { ok: false, kind: "closed", error: "Ссылка недействительна или приём заявок закрыт." };
  if (res.code === "P0019") return { ok: false, kind: "rate", error: "Слишком много заявок. Попробуйте позже." };
  if (res.code === "P0015" && res.message) return { ok: false, kind: "invalid", error: res.message };
  return { ok: false, kind: "error", error: GENERIC };
}
