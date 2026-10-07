import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { parseCsv, detectDelimiter } from "./csv";
import { tableFromMatrix } from "./table";
import { autoMap, missingRequired } from "./mapping";
import { buildStageRows } from "./build";
import { normalizeDate, normalizeNumber, normalizeValue, excelSerialToIso } from "./normalize";
import { checkUpload, decodeText } from "./file-check";
import { sha256Hex } from "./hash";
import { parseXlsx, cellToText } from "./xlsx";
import { buildTemplateXlsx } from "./templates";
import { canImportEntity, entityFromSlug, IMPORT_ENTITIES } from "./entities";

describe("parseCsv", () => {
  it("запятая, кавычки и экранированные кавычки", () => {
    expect(parseCsv('a,b\n"x, y","он сказал ""да"""\n')).toEqual([["a", "b"], ["x, y", 'он сказал "да"']]);
  });
  it("точка с запятой, BOM и CRLF", () => {
    expect(parseCsv("﻿ФИО;Часы\r\nИванов;8\r\n")).toEqual([["ФИО", "Часы"], ["Иванов", "8"]]);
  });
  it("табуляция (вставка из Google Sheets) и перенос строки внутри кавычек", () => {
    expect(parseCsv('ФИО\tПримечание\nИванов\t"a\nb"')).toEqual([["ФИО", "Примечание"], ["Иванов", "a\nb"]]);
  });
  it("определение разделителя", () => {
    expect(detectDelimiter("a;b;c\n1;2;3")).toBe(";");
    expect(detectDelimiter("a,b,c")).toBe(",");
    expect(detectDelimiter("a\tb\tc")).toBe("\t");
    expect(detectDelimiter('"a;b",c')).toBe(",");
  });
  it("одно значение без разделителей", () => {
    expect(parseCsv("Иванов Иван\nПетров Пётр")).toEqual([["Иванов Иван"], ["Петров Пётр"]]);
  });
});

describe("tableFromMatrix", () => {
  it("пропускает пустые строки, нумерует и делает заголовки уникальными", () => {
    const t = tableFromMatrix([[""], ["ФИО", "ФИО", ""], ["Иванов", "x", "y"], ["", "", ""], ["Петров"]]);
    expect(t.headers).toEqual(["ФИО", "ФИО (2)", "Колонка 3"]);
    expect(t.rows).toEqual([{ rowNo: 3, cells: ["Иванов", "x", "y"] }, { rowNo: 5, cells: ["Петров", "", ""] }]);
  });
});

describe("autoMap", () => {
  it("сотрудники", () => {
    const m = autoMap(["ФИО", "Табельный номер", "Должность", "Подразделение", "Отдел", "Дата приёма"], "EMPLOYEES");
    expect(m).toMatchObject({ full_name: 0, employee_code: 1, position: 2, department: 3, unit: 4, hire_date: 5 });
  });
  it("мероприятия: «Название тренинга», «Дата», «Часы»", () => {
    const m = autoMap(["Название тренинга", "Дата", "Часы", "Провайдер"], "LEARNING_EVENTS");
    expect(m).toMatchObject({ title: 0, start_date: 1, hours: 2, organizer: 3 });
  });
  it("экзамены и расходы", () => {
    expect(autoMap(["Сотрудник", "Экзамен", "Дата", "Результат", "Балл"], "EXAMS")).toMatchObject({ full_name: 0, qualification: 1, exam_date: 2, result: 3, score: 4 });
    expect(autoMap(["Название тренинга", "Статья", "Сумма", "Валюта", "Дата"], "EXPENSES")).toMatchObject({ training: 0, category: 1, amount: 2, currency: 3, date: 4 });
  });
  it("английские заголовки и одна колонка — одно поле", () => {
    const m = autoMap(["Employee", "Code", "Email"], "EMPLOYEES");
    expect(m.full_name).toBe(0);
    expect(m.employee_code).toBe(1);
    expect(m.email).toBe(2);
  });
  it("обязательные поля", () => {
    expect(missingRequired(autoMap(["Должность"], "EMPLOYEES"), "EMPLOYEES")).toContain("ФИО");
    expect(missingRequired(autoMap(["Табельный номер"], "PARTICIPANTS"), "PARTICIPANTS")).toEqual([]);
    expect(missingRequired(autoMap(["Примечание"], "PARTICIPANTS"), "PARTICIPANTS")).toEqual(["ФИО или Табельный номер"]);
  });
});

describe("normalize", () => {
  it("даты", () => {
    expect(normalizeDate("05.10.2026")).toBe("2026-10-05");
    expect(normalizeDate("5/10/2026")).toBe("2026-10-05");
    expect(normalizeDate("2026-10-05T00:00:00Z")).toBe("2026-10-05");
    expect(normalizeDate("31.02.2026")).toBe("31.02.2026");
    expect(normalizeDate("45000")).toBe("2023-03-15");
    expect(excelSerialToIso(44927)).toBe("2023-01-01");
  });
  it("числа", () => {
    expect(normalizeNumber("1 500,50")).toBe("1500.50");
    expect(normalizeNumber("1,500.25")).toBe("1500.25");
    expect(normalizeNumber("abc")).toBe("abc");
  });
  it("перечисления", () => {
    expect(normalizeValue("format", "Очно")).toBe("OFFLINE");
    expect(normalizeValue("funding_source", "Компания")).toBe("COMPANY");
    expect(normalizeValue("currency", "usd")).toBe("USD");
    expect(normalizeValue("training", "tr-2026-0001")).toBe("TR-2026-0001");
  });
});

describe("buildStageRows", () => {
  it("собирает raw и data, пропускает пустые", () => {
    const table = tableFromMatrix([["ФИО", "Дата приёма", "Лишнее"], ["Иванов Иван", "01.02.2020", "x"], ["", "", "z"]]);
    const mapping = autoMap(table.headers, "EMPLOYEES");
    const r = buildStageRows(table, mapping, "EMPLOYEES");
    expect(r.rows).toEqual([{ row_no: 2, raw: { ФИО: "Иванов Иван", "Дата приёма": "01.02.2020", Лишнее: "x" }, data: { full_name: "Иванов Иван", hire_date: "2020-02-01" } }]);
    expect(r.skippedEmpty).toBe(1);
    expect(r.missing).toEqual([]);
  });
});

describe("checkUpload / decodeText", () => {
  it("расширение, размер, сигнатура", () => {
    expect(checkUpload("a.exe", new Uint8Array([1]))).toMatchObject({ ok: false });
    expect(checkUpload("a.xlsx", new Uint8Array([1, 2, 3, 4]))).toMatchObject({ ok: false });
    expect(checkUpload("a.xlsx", new Uint8Array([0x50, 0x4b, 3, 4]))).toMatchObject({ ok: true, kind: "xlsx" });
    expect(checkUpload("a.csv", new TextEncoder().encode("a,b"))).toMatchObject({ ok: true, kind: "text" });
    expect(checkUpload("a.csv", new Uint8Array([97, 0, 98]))).toMatchObject({ ok: false });
    expect(checkUpload("a.csv", new Uint8Array(0))).toMatchObject({ ok: false });
    expect(checkUpload("a.csv", new Uint8Array(5 * 1024 * 1024 + 1).fill(97))).toMatchObject({ ok: false });
  });
  it("windows-1251", () => {
    expect(decodeText(new Uint8Array([0xd4, 0xc8, 0xce]))).toBe("ФИО");
    expect(decodeText(new TextEncoder().encode("ФИО"))).toBe("ФИО");
  });
});

describe("sha256Hex", () => {
  it("известное значение", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("xlsx", () => {
  it("cellToText: формулы, даты, rich text", () => {
    expect(cellToText({ formula: "A1+1", result: 5 })).toBe("5");
    expect(cellToText(new Date(Date.UTC(2026, 9, 5)))).toBe("2026-10-05");
    expect(cellToText({ richText: [{ text: "a" }, { text: "b" }] })).toBe("ab");
    expect(cellToText({ error: "#N/A" })).toBe("");
  });
  it("шаблон читается обратно, заголовки автосопоставляются", async () => {
    for (const e of IMPORT_ENTITIES) {
      const bytes = await buildTemplateXlsx(e);
      expect(checkUpload("t.xlsx", bytes)).toMatchObject({ ok: true });
      const r = await parseXlsx(bytes);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      const m = autoMap(r.table.headers, e);
      expect(missingRequired(m, e)).toEqual([]);
      expect(r.table.rows.length).toBe(1);
    }
  });
  it("даты и формулы из книги", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Лист1");
    ws.addRow(["ФИО", "Дата приёма"]);
    ws.addRow(["Иванов", new Date(Date.UTC(2020, 1, 1))]);
    ws.addRow(["Петров", { formula: "DATE(2021,3,4)", result: new Date(Date.UTC(2021, 2, 4)) }]);
    const bytes = new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
    const r = await parseXlsx(bytes);
    expect(r.ok && r.table.rows.map((x) => x.cells)).toEqual([["Иванов", "2020-02-01"], ["Петров", "2021-03-04"]]);
  });
  it("мусор вместо xlsx", async () => {
    expect(await parseXlsx(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2]))).toMatchObject({ ok: false });
  });
});

describe("роли и сущности", () => {
  it("повторяет can_import", () => {
    expect(canImportEntity("HR", "EMPLOYEES")).toBe(true);
    expect(canImportEntity("HR", "EXPENSES")).toBe(false);
    expect(canImportEntity("HR", "LEARNING_EVENTS")).toBe(false);
    expect(canImportEntity("FINANCE", "EXPENSES")).toBe(true);
    expect(canImportEntity("FINANCE", "EXAMS")).toBe(false);
    expect(canImportEntity("ACADEMY_MANAGER", "LEARNING_EVENTS")).toBe(true);
    expect(canImportEntity("VIEWER", "EMPLOYEES")).toBe(false);
    expect(canImportEntity("ADMIN", "CERTIFICATES")).toBe(true);
  });
  it("slug", () => {
    expect(entityFromSlug("learning_events")).toBe("LEARNING_EVENTS");
    expect(entityFromSlug("EMPLOYEES")).toBe("EMPLOYEES");
    expect(entityFromSlug("x")).toBeNull();
  });
});
