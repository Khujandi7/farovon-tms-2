import { autoMap } from "./mapping";
import { parsePasted } from "./csv";
import { tableFromMatrix, type SheetTable } from "./table";
import type { ImportEntity } from "./entities";

/** Вставленный текст → таблица. Если первая строка похожа на заголовки сущности — это таблица с шапкой, иначе — список без шапки. */
export function tableFromPastedText(text: string, entity: ImportEntity): SheetTable {
  const matrix = parsePasted(text);
  const first = matrix.find((r) => r.some((c) => c.trim() !== ""));
  if (first) {
    const mapped = Object.values(autoMap(first.map((c) => c.trim()), entity)).filter((v) => v !== null).length;
    if (mapped >= 1 && first.length >= 1) return tableFromMatrix(matrix);
  }
  return namesTable(text);
}

/** Список ФИО построчно (одно ФИО в строке; допускается «ФИО<таб>табельный»). */
export function namesTable(text: string): SheetTable {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const rows: SheetTable["rows"] = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    const cells = t.split("\t").map((c) => c.trim());
    rows.push({ rowNo: i + 1, cells: [cells[0] ?? "", cells[1] ?? ""] });
  });
  const hasCode = rows.some((r) => r.cells[1]);
  return { headers: hasCode ? ["ФИО", "Табельный номер"] : ["ФИО"], rows: hasCode ? rows : rows.map((r) => ({ rowNo: r.rowNo, cells: [r.cells[0] ?? ""] })) };
}
