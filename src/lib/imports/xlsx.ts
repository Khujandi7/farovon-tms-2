import { MAX_COLUMNS, MAX_ROWS, tableFromMatrix, type SheetTable } from "./table";
import { dateToIsoUtc } from "./normalize";

/**
 * Чтение .xlsx — ТОЛЬКО на сервере (route handler / серверное действие). exceljs подключается динамически,
 * чтобы не попасть в клиентский бандл. Формулы не вычисляются: берётся сохранённый результат (result).
 */
export function cellToText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : dateToIsoUtc(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "да" : "нет";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("result" in o) return cellToText(o.result); // формула
    if ("error" in o) return "";
    if (Array.isArray(o.richText)) return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("").trim();
    if (typeof o.text === "string") return o.text.trim(); // гиперссылка
    if ("sharedFormula" in o || "formula" in o) return "";
  }
  return "";
}

export type XlsxResult = { ok: true; table: SheetTable; sheetName: string } | { ok: false; error: string };

export async function parseXlsx(buffer: ArrayBuffer | Uint8Array): Promise<XlsxResult> {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    await wb.xlsx.load(data as unknown as ArrayBuffer);
    const sheets = wb.worksheets.filter((s) => s.state === "visible");
    // лист «Данные» (из наших шаблонов) приоритетнее первого
    const ws = sheets.find((s) => s.name.trim().toLowerCase() === "данные") ?? sheets[0];
    if (!ws) return { ok: false, error: "В книге нет листов с данными." };
    const matrix: string[][] = [];
    const lastRow = Math.min(ws.actualRowCount > 0 ? ws.rowCount : 0, MAX_ROWS + 50);
    if (ws.rowCount > MAX_ROWS + 50 && ws.actualRowCount > MAX_ROWS + 1) return { ok: false, error: "Не больше 5000 строк за раз." };
    const cols = Math.min(ws.columnCount, MAX_COLUMNS);
    for (let r = 1; r <= lastRow; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= cols; c++) cells.push(cellToText(row.getCell(c).value));
      matrix.push(cells);
    }
    const table = tableFromMatrix(matrix);
    if (table.rows.length > MAX_ROWS) return { ok: false, error: "Не больше 5000 строк за раз." };
    return { ok: true, table, sheetName: ws.name };
  } catch {
    return { ok: false, error: "Не удалось прочитать файл Excel. Проверьте, что это .xlsx без пароля." };
  }
}
