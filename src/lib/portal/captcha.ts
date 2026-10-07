/**
 * Заготовка под CAPTCHA. Внешние сервисы не подключены: по умолчанию проверка всегда проходит.
 * Чтобы включить, добавьте реализацию в `verifiers` и задайте PUBLIC_REQUEST_CAPTCHA=<имя> (серверная переменная).
 */
export type CaptchaResult = { ok: true } | { ok: false; reason: string };
export type CaptchaVerifier = (token: string | undefined, context: { ip: string }) => Promise<CaptchaResult>;

export const noopCaptcha: CaptchaVerifier = async () => ({ ok: true });

const verifiers: Record<string, CaptchaVerifier> = {
  none: noopCaptcha,
};

export function getCaptchaVerifier(provider: string | undefined): CaptchaVerifier {
  const key = (provider ?? "none").trim().toLowerCase() || "none";
  // Неизвестный провайдер = закрыто по умолчанию: ошибка настройки не должна отключать защиту молча.
  return verifiers[key] ?? (async () => ({ ok: false, reason: "CAPTCHA не настроена" }));
}

export async function verifyCaptcha(token: string | undefined, ip: string): Promise<CaptchaResult> {
  return getCaptchaVerifier(process.env.PUBLIC_REQUEST_CAPTCHA)(token, { ip });
}
