import { ENTITY_DEFS, type ImportEntity } from "./entities";
import { missingRequired, type ColumnMapping } from "./mapping";
import { MAX_ROWS, type SheetTable } from "./table";
import { normalizeValue } from "./normalize";

export type StageRow = { row_no: number; raw: Record<string, string>; data: Record<string, string> };

export type BuildResult = {
  rows: StageRow[];
  missing: string[];
  /** Строки, в которых нет ни одного значимого поля (пропущены). */
  skippedEmpty: number;
  tooMany: boolean;
};

/** Итоговая сборка строк для import_stage: raw = исходные ячейки по заголовкам, data = нормализованные поля сущности. */
export function buildStageRows(table: SheetTable, mapping: ColumnMapping, entity: ImportEntity): BuildResult {
  const fields = ENTITY_DEFS[entity].fields;
  const missing = missingRequired(mapping, entity);
  const rows: StageRow[] = [];
  let skippedEmpty = 0;
  for (const r of table.rows) {
    const raw: Record<string, string> = {};
    table.headers.forEach((h, i) => {
      if (r.cells[i]) raw[h] = r.cells[i];
    });
    const data: Record<string, string> = {};
    for (const f of fields) {
      const idx = mapping[f.key];
      if (idx == null) continue;
      const v = normalizeValue(f.key, r.cells[idx] ?? "");
      if (v) data[f.key] = v;
    }
    if (Object.keys(data).length === 0) {
      skippedEmpty++;
      continue;
    }
    rows.push({ row_no: r.rowNo, raw, data });
  }
  return { rows, missing, skippedEmpty, tooMany: rows.length > MAX_ROWS };
}
