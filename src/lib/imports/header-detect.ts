import { autoMap, type ColumnMapping } from "./mapping";
import type { ImportEntity } from "./entities";
import { tableFromMatrix, type SheetTable } from "./table";

/**
 * Строка заголовков в «живых» таблицах часто не первая (над ней название, дата выгрузки, пустые строки).
 * Берём строку из первых 15, в которой автосопоставление узнаёт больше всего полей; при равенстве — более раннюю.
 * Если не узнано ни одно поле — первая непустая строка (как в загрузке файлов).
 * Возвращает индекс строки (0 = первая строка листа).
 */
export function detectHeaderRow(matrix: string[][], entity: ImportEntity): number {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < Math.min(matrix.length, 15); i++) {
    const row = (matrix[i] ?? []).map((c) => String(c ?? "").trim());
    if (row.filter(Boolean).length < 1) continue;
    if (best < 0) best = i;
    const score = Object.values(autoMap(row, entity)).filter((v) => v !== null).length;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best < 0 ? 0 : best;
}

/** Таблица с заголовком на указанной строке (0 = первая): строки выше заголовка отбрасываются, номера строк — как в листе. */
export function tableWithHeaderAt(matrix: string[][], headerIndex: number): SheetTable {
  const blank = matrix.slice(0, headerIndex).map(() => [] as string[]);
  return tableFromMatrix([...blank, ...matrix.slice(headerIndex)]);
}

/** Сохранённое соответствие хранится по названиям колонок: перестановка колонок в таблице его не ломает. */
export function mappingToNames(mapping: ColumnMapping, headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, i] of Object.entries(mapping)) if (i !== null && i !== undefined && headers[i] !== undefined) out[k] = headers[i]!;
  return out;
}

export function namesToMapping(names: Record<string, string>, headers: string[], entity: ImportEntity): { mapping: ColumnMapping; lost: string[] } {
  const mapping = Object.fromEntries(Object.keys(autoMap([], entity)).map((k) => [k, null])) as ColumnMapping;
  const lost: string[] = [];
  for (const [k, name] of Object.entries(names)) {
    const i = headers.indexOf(name);
    if (i >= 0) mapping[k] = i;
    else lost.push(name);
  }
  return { mapping, lost };
}
