import type { ParsedTable } from "./types";

/** Загрузка файла на серверный разбор (/imports/parse). Вызывается только из браузера. */
export async function uploadForParsing(file: File): Promise<{ ok: true; table: ParsedTable } | { ok: false; error: string }> {
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "Файл больше 5 МБ." };
  const body = new FormData();
  body.set("file", file);
  try {
    const res = await fetch("/imports/parse", { method: "POST", body });
    const j = (await res.json().catch(() => null)) as (Partial<ParsedTable> & { ok?: boolean; error?: string }) | null;
    if (!res.ok || !j?.ok) return { ok: false, error: j?.error ?? "Не удалось разобрать файл. Попробуйте ещё раз." };
    return {
      ok: true,
      table: { headers: j.headers ?? [], rows: j.rows ?? [], fileName: j.fileName ?? file.name, fileHash: j.fileHash ?? "", source: j.source === "XLSX" ? "XLSX" : "CSV", truncatedColumns: j.truncatedColumns },
    };
  } catch {
    return { ok: false, error: "Нет связи с сервером. Проверьте подключение." };
  }
}
