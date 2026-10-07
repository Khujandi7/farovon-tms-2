import { createHmac } from "node:crypto";

/**
 * client_hash = HMAC-SHA256(secret, ip + "|" + user-agent) в hex (64 символа).
 * В БД попадает только хэш: IP и User-Agent не сохраняются. Без секрета хэш не подобрать перебором адресов.
 */
export function computeClientHash(ip: string, userAgent: string, secret: string): string {
  return createHmac("sha256", secret).update(`${ip.trim()}|${userAgent.trim().slice(0, 300)}`).digest("hex");
}

/** Первый адрес из x-forwarded-for (клиентский), иначе x-real-ip, иначе "unknown". */
export function pickClientIp(forwardedFor: string | null | undefined, realIp: string | null | undefined): string {
  const first = forwardedFor?.split(",")[0]?.trim();
  return first || realIp?.trim() || "unknown";
}

/**
 * Секрет хэширования. Порядок: PUBLIC_REQUEST_HASH_SECRET → производный от ключа service_role (уже секретный, на сервере) →
 * фиксированная строка для локальной разработки. Производный ключ получаем HMAC-ом с меткой, сам ключ наружу не уходит.
 */
export function resolveHashSecret(env: { PUBLIC_REQUEST_HASH_SECRET?: string; DERIVE_FROM?: string }): string {
  const own = env.PUBLIC_REQUEST_HASH_SECRET?.trim();
  if (own && own.length >= 16) return own;
  const svc = env.DERIVE_FROM?.trim();
  if (svc) return createHmac("sha256", svc).update("farovon-public-request-client-hash").digest("hex");
  return "farovon-tms-dev-only-client-hash-secret";
}
