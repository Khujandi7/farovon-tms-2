/**
 * Разбор ссылки Google Sheets. Чистая функция без секретов: используется и в браузере (подсказка в форме), и на сервере.
 * Принимаются только адреса docs.google.com/spreadsheets/d/<ID>…; опубликованные (/d/e/…) и чужие домены отклоняются.
 */
export type SheetUrl = { spreadsheetId: string; gid: number | null; url: string };

const ID_RE = /^[A-Za-z0-9_-]{20,100}$/;

export function parseSheetUrl(input: string): { ok: true; value: SheetUrl } | { ok: false; error: string } {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, error: "Вставьте ссылку на Google-таблицу." };
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "Это не ссылка. Скопируйте адрес таблицы из браузера." };
  }
  if (u.protocol !== "https:" || u.hostname !== "docs.google.com") return { ok: false, error: "Нужна ссылка вида https://docs.google.com/spreadsheets/d/…" };
  const m = u.pathname.match(/^\/spreadsheets\/d\/([^/]+)/);
  if (!m || m[1] === "e") return { ok: false, error: m?.[1] === "e" ? "Это ссылка «Опубликовать в интернете». Нужна обычная ссылка на таблицу." : "Нужна ссылка вида https://docs.google.com/spreadsheets/d/…" };
  const id = m[1]!;
  if (!ID_RE.test(id)) return { ok: false, error: "В ссылке нет корректного идентификатора таблицы." };
  const gidRaw = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get("gid");
  const gid = gidRaw && /^\d+$/.test(gidRaw) ? Number(gidRaw) : null;
  return { ok: true, value: { spreadsheetId: id, gid, url: `https://docs.google.com/spreadsheets/d/${id}/edit${gid !== null ? `#gid=${gid}` : ""}` } };
}
