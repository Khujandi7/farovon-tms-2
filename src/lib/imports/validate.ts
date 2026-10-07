import { ENTITY_DEFS, type ImportEntity } from "./entities";
import type { StageRow } from "./build";

export type RowIssue = { rowNo: number; field?: string; message: string };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const NUM = /^-?\d+(\.\d+)?$/;
const DATE_KEYS = new Set(["hire_date", "termination_date", "start_date", "end_date", "exam_date", "issue_date", "expiration_date", "date"]);
const NUM_KEYS = new Set(["hours", "amount", "fee", "score"]);

/**
 * Предварительная проверка на клиенте (шаг «Валидация»): быстрые ошибки формата. Окончательный анализ делает БД (dry run).
 * Строки с замечаниями всё равно уходят в import_stage — БД пометит их ERROR и они будут пропущены при применении.
 */
export function validateRows(rows: StageRow[], entity: ImportEntity): { issues: RowIssue[]; badRows: number } {
  const fields = ENTITY_DEFS[entity].fields;
  const issues: RowIssue[] = [];
  const bad = new Set<number>();
  const add = (rowNo: number, message: string, field?: string) => {
    issues.push({ rowNo, message, field });
    bad.add(rowNo);
  };
  for (const r of rows) {
    for (const f of fields) {
      const v = r.data[f.key];
      if (f.required && !v) add(r.row_no, `Не заполнено поле «${f.label}»`, f.key);
      if (!v) continue;
      if (DATE_KEYS.has(f.key) && !ISO.test(v)) add(r.row_no, `«${f.label}»: не удалось распознать дату «${v}»`, f.key);
      if (NUM_KEYS.has(f.key) && !NUM.test(v)) add(r.row_no, `«${f.label}»: ожидается число, получено «${v}»`, f.key);
    }
    const groups = fields.filter((f) => f.anyOf);
    if (groups.length > 0 && groups.every((f) => !r.data[f.key])) add(r.row_no, "Не указан сотрудник (ФИО или табельный номер)");
    if (entity === "LEARNING_EVENTS" && r.data.hours && NUM.test(r.data.hours) && Number(r.data.hours) <= 0) add(r.row_no, "«Часы» должны быть больше 0", "hours");
    if (entity === "EXPENSES" && r.data.amount && NUM.test(r.data.amount) && Number(r.data.amount) < 0) add(r.row_no, "«Сумма» не может быть отрицательной", "amount");
  }
  return { issues, badRows: bad.size };
}
