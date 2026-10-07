import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { WF_ROLES } from "@/lib/workflows/roles";
import { checkUpload, decodeText } from "@/lib/imports/file-check";
import { parseCsv } from "@/lib/imports/csv";
import { tableFromMatrix, MAX_ROWS, MAX_FILE_BYTES } from "@/lib/imports/table";
import { parseXlsx } from "@/lib/imports/xlsx";
import { sha256Hex } from "@/lib/imports/hash";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Разбор загруженного файла (.xlsx/.csv/.tsv/.txt) на сервере. В БД ничего не пишется.
 * Серверное действие не подходит: у него лимит тела 1 МБ, а файл может быть до 5 МБ.
 */
export async function POST(request: Request) {
  let session;
  try {
    session = await getSession();
  } catch {
    return json({ ok: false, error: "Сервис временно недоступен. Попробуйте позже." }, 503);
  }
  if (session.status !== "ok" || !(WF_ROLES.importAny as readonly string[]).includes(session.role)) return json({ ok: false, error: "Недостаточно прав для импорта." }, 403);

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES + 64 * 1024) return json({ ok: false, error: "Файл больше 5 МБ." }, 413);

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return json({ ok: false, error: "Не удалось прочитать загрузку." }, 400);
  }
  if (!file) return json({ ok: false, error: "Выберите файл." }, 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const fileName = file.name.replace(/[\\/]/g, "_").slice(0, 200) || "import";
  const check = checkUpload(fileName, bytes);
  if (!check.ok) return json({ ok: false, error: check.error }, 400);

  const fileHash = await sha256Hex(bytes);
  if (check.kind === "xlsx") {
    const r = await parseXlsx(bytes);
    if (!r.ok) return json({ ok: false, error: r.error }, 400);
    if (r.table.rows.length === 0) return json({ ok: false, error: "В файле нет строк с данными." }, 400);
    return json({ ok: true, fileName, fileHash, source: "XLSX", sheetName: r.sheetName, ...r.table });
  }
  const table = tableFromMatrix(parseCsv(decodeText(bytes)));
  if (table.rows.length === 0) return json({ ok: false, error: "В файле нет строк с данными." }, 400);
  if (table.rows.length > MAX_ROWS) return json({ ok: false, error: "Не больше 5000 строк за раз." }, 400);
  return json({ ok: true, fileName, fileHash, source: "CSV", ...table });
}
