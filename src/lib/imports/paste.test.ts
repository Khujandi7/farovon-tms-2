import { describe, expect, it } from "vitest";
import { namesTable, tableFromPastedText } from "./paste";
import { validateRows } from "./validate";
import { buildStageRows } from "./build";
import { autoMap } from "./mapping";

describe("paste", () => {
  it("список ФИО без шапки", () => {
    const t = tableFromPastedText("Иванов Иван Иванович\n\nПетров Пётр\n", "PARTICIPANTS");
    expect(t.headers).toEqual(["ФИО"]);
    expect(t.rows).toEqual([{ rowNo: 1, cells: ["Иванов Иван Иванович"] }, { rowNo: 3, cells: ["Петров Пётр"] }]);
  });
  it("таблица из Google Sheets с шапкой", () => {
    const t = tableFromPastedText("ФИО\tТабельный номер\nИванов\t001\nПетров\t002", "PARTICIPANTS");
    expect(t.headers).toEqual(["ФИО", "Табельный номер"]);
    expect(t.rows).toHaveLength(2);
  });
  it("ФИО + код через табуляцию без шапки", () => {
    expect(namesTable("Иванов\t001\nПетров\t").headers).toEqual(["ФИО", "Табельный номер"]);
  });
});

describe("validateRows", () => {
  it("находит плохие даты, числа и пустого сотрудника", () => {
    const table = { headers: ["Сотрудник", "Квалификация", "Дата", "Балл"], rows: [
      { rowNo: 2, cells: ["Иванов", "ACCA", "31.02.2026", "abc"] },
      { rowNo: 3, cells: ["", "ACCA", "2026-01-01", "5"] },
      { rowNo: 4, cells: ["Петров", "ACCA", "2026-01-01", "90"] },
    ] };
    const { rows } = buildStageRows(table, autoMap(table.headers, "EXAMS"), "EXAMS");
    const v = validateRows(rows, "EXAMS");
    expect(v.badRows).toBe(2);
    expect(v.issues.map((i) => i.rowNo)).toEqual([2, 2, 3]);
  });
});
