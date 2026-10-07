/** Превращение матрицы ячеек в таблицу «заголовки + строки» с номерами исходных строк. */

export type SheetTable = {
  headers: string[];
  /** Строки данных: cells и номер строки в исходном файле (1 = первая строка файла). */
  rows: { rowNo: number; cells: string[] }[];
  truncatedColumns?: boolean;
};

export const MAX_ROWS = 5000;
export const MAX_COLUMNS = 60;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

const isEmptyRow = (r: string[]) => r.every((c) => c.trim() === "");

/** Первая непустая строка — заголовки. Пустые заголовки получают «Колонка N», повторы — суффикс. */
export function tableFromMatrix(matrix: string[][]): SheetTable {
  let h = 0;
  while (h < matrix.length && isEmptyRow(matrix[h] ?? [])) h++;
  const head = matrix[h];
  if (!head) return { headers: [], rows: [] };
  const body = matrix.slice(h);
  const maxWidth = Math.max(...body.map((r) => r.length));
  const width = Math.min(MAX_COLUMNS, maxWidth);
  const seen = new Map<string, number>();
  const headers = Array.from({ length: width }, (_, i) => {
    const base = (head[i] ?? "").trim().replace(/\s+/g, " ") || `Колонка ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
  const rows: SheetTable["rows"] = [];
  body.forEach((r, k) => {
    if (k === 0 || isEmptyRow(r)) return;
    rows.push({ rowNo: h + k + 1, cells: Array.from({ length: width }, (_, c) => (r[c] ?? "").trim()) });
  });
  return { headers, rows, truncatedColumns: maxWidth > MAX_COLUMNS };
}
