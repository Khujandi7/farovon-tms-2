import { describe, expect, it } from "vitest";
import { parseSheetUrl } from "./sheets-url";
import { detectHeaderRow, mappingToNames, namesToMapping, tableWithHeaderAt } from "@/lib/imports/header-detect";
import { buildStageRows } from "@/lib/imports/build";
import { autoMap } from "@/lib/imports/mapping";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";

describe("ссылка Google Sheets", () => {
  it("достаёт ID и лист (gid) из обычной ссылки", () => {
    const r = parseSheetUrl(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123456`);
    expect(r).toEqual({ ok: true, value: { spreadsheetId: ID, gid: 123456, url: `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123456` } });
  });
  it("ссылка без /edit и с параметрами", () => {
    const r = parseSheetUrl(`  https://docs.google.com/spreadsheets/d/${ID}?usp=sharing `);
    expect(r.ok && r.value.spreadsheetId).toBe(ID);
    expect(r.ok && r.value.gid).toBeNull();
  });
  it("отклоняет чужие домены, http, опубликованные ссылки и мусор", () => {
    for (const bad of ["", "таблица", `http://docs.google.com/spreadsheets/d/${ID}`, `https://evil.com/spreadsheets/d/${ID}`, `https://docs.google.com.evil.com/spreadsheets/d/${ID}`,
      "https://docs.google.com/spreadsheets/d/e/2PACX-1vT/pubhtml", "https://docs.google.com/document/d/" + ID, "https://docs.google.com/spreadsheets/d/short"]) {
      expect(parseSheetUrl(bad).ok, bad).toBe(false);
    }
  });
});

describe("предпросмотр листа и соответствие колонок", () => {
  const matrix = [
    ["Выгрузка из 1С", "", ""],
    ["на 01.10.2026"],
    [],
    ["Таб. №", "ФИО", "Должность", "Департамент"],
    ["T-1", "Алиев Рустам", "Мастер", "Производство"],
    ["", "", "", ""],
    ["T-2", "Бобоев Сухроб", "Оператор", "Производство"],
  ];
  it("находит строку заголовков ниже служебных строк", () => {
    expect(detectHeaderRow(matrix, "EMPLOYEES")).toBe(3);
  });
  it("строки нумеруются как в листе, пустые пропускаются", () => {
    const t = tableWithHeaderAt(matrix, 3);
    expect(t.headers).toEqual(["Таб. №", "ФИО", "Должность", "Департамент"]);
    expect(t.rows.map((r) => r.rowNo)).toEqual([5, 7]);
  });
  it("автосопоставление и сборка строк для dry run", () => {
    const t = tableWithHeaderAt(matrix, 3);
    const m = autoMap(t.headers, "EMPLOYEES");
    expect(m.full_name).toBe(1);
    expect(m.employee_code).toBe(0);
    const built = buildStageRows(t, m, "EMPLOYEES");
    expect(built.missing).toEqual([]);
    expect(built.rows[0]!.data).toMatchObject({ full_name: "Алиев Рустам", employee_code: "T-1", position: "Мастер", department: "Производство" });
  });
  it("сохранённое соответствие переживает перестановку колонок; пропавшая колонка видна", () => {
    const names = mappingToNames({ full_name: 1, employee_code: 0, position: null }, ["Таб. №", "ФИО"]);
    expect(names).toEqual({ full_name: "ФИО", employee_code: "Таб. №" });
    const moved = namesToMapping(names, ["ФИО", "Должность", "Таб. №"], "EMPLOYEES");
    expect(moved.mapping.full_name).toBe(0);
    expect(moved.mapping.employee_code).toBe(2);
    expect(moved.lost).toEqual([]);
    expect(namesToMapping(names, ["Сотрудник"], "EMPLOYEES").lost).toEqual(["ФИО", "Таб. №"]);
  });
});
