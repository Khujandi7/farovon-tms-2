/** Полный адрес общей формы и ссылок подразделений. Чистые функции: origin определяется снаружи. */

export function normalizeOrigin(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Приоритет: явный NEXT_PUBLIC_SITE_URL, затем заголовки запроса, затем локальный адрес. */
export function resolveOrigin(input: { envUrl?: string | null; host?: string | null; proto?: string | null }): string {
  const fromEnv = normalizeOrigin(input.envUrl);
  if (fromEnv) return fromEnv;
  const host = input.host?.split(",")[0]?.trim();
  if (host && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host)) {
    const proto = input.proto?.split(",")[0]?.trim() === "http" ? "http" : "https";
    return `${proto}://${host}`;
  }
  return "http://localhost:3000";
}

export function buildRequestUrl(origin: string, token?: string | null): string {
  const base = origin.replace(/\/+$/, "");
  return token ? `${base}/request/${encodeURIComponent(token)}` : `${base}/request`;
}
