/** Адрес выгрузки: /export/<entity>?format=...&<фильтры>. Пустые значения пропускаются. */
export function exportHref(entity: string, format: "csv" | "xlsx", params?: Record<string, string | number | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params ?? {})) {
    if (k === "format" || k === "page" || v === null || v === undefined || v === "") continue;
    sp.set(k, String(v));
  }
  sp.set("format", format);
  return `/export/${encodeURIComponent(entity)}?${sp.toString()}`;
}
