/** Чистая логика CSV: экранирование, защита от формул, сборка файла (UTF-8 с BOM, разделитель «;» для Excel-RU). */

export const CSV_SEPARATOR = ";";
export const CSV_BOM = "﻿";
export type Cell = string | number | boolean | Date | null | undefined;

/**
 * Защита от CSV/формульной инъекции: значения, начинающиеся с = + - @ (а также табуляцией/CR), Excel выполнит как формулу.
 * Такие строки получают префикс-апостроф. Числа (в т.ч. отрицательные) формулой не являются и не затрагиваются.
 */
export function neutralizeFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function cellToText(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "boolean") return v ? "Да" : "Нет";
  if (typeof v === "number") return Number.isFinite(v) ? String(v).replace(".", ",") : "";
  return v;
}

/** Одно значение CSV: защита от формул + кавычки, если есть разделитель, кавычка или перевод строки. */
export function escapeCsvCell(v: Cell): string {
  const raw = cellToText(v);
  const text = typeof v === "string" ? neutralizeFormula(raw) : raw;
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  const lines = [headers.map(escapeCsvCell).join(CSV_SEPARATOR), ...rows.map((r) => r.map(escapeCsvCell).join(CSV_SEPARATOR))];
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

/** Значение XLSX-ячейки: строки защищаются от формул так же, как в CSV (формулы в файле нам не нужны). */
export function safeXlsxValue(v: Cell): string | number | boolean | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return neutralizeFormula(v);
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  return v;
}
