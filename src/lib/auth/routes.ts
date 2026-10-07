/** Маршруты, доступные без входа. Всё остальное закрыто (см. src/proxy.ts). /request и /request/<token> — публичный портал заявок. */
export const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/confirm", "/auth/error", "/request"] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Безопасный адрес возврата после входа: только относительный путь внутри приложения.
 * Защищает от открытого редиректа (?next=https://evil.example, //evil.example, /\evil).
 */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  if (isPublicPath(value.split("?")[0] ?? "")) return fallback;
  return value;
}

/** Что передать в ?next= при перенаправлении на вход (корень приложения не передаём). */
export function loginRedirectPath(pathWithSearch: string): string | null {
  if (pathWithSearch === "/" || pathWithSearch === "") return null;
  const safe = safeNextPath(pathWithSearch, "");
  return safe || null;
}
