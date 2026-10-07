import { describe, expect, it } from "vitest";
import { CSV_BOM, escapeCsvCell, neutralizeFormula, safeXlsxValue, toCsv } from "./csv";

describe("защита от формул", () => {
  it.each(["=1+1", "+7 900", "-cmd", "@SUM(A1)", "\tтаб", "\rcr"])("префиксует апострофом: %j", (v) => {
    expect(neutralizeFormula(v)).toBe(`'${v}`);
  });
  it("обычный текст не трогает", () => {
    expect(neutralizeFormula("Иванов = директор")).toBe("Иванов = директор");
  });
  it("числа, включая отрицательные, не считаются формулой", () => {
    expect(escapeCsvCell(-5)).toBe("-5");
    expect(safeXlsxValue(-5)).toBe(-5);
  });
  it("в XLSX строки защищены так же", () => {
    expect(safeXlsxValue("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
  });
});

describe("экранирование CSV", () => {
  it("кавычки удваиваются, значение оборачивается", () => {
    expect(escapeCsvCell('Он сказал "да"')).toBe('"Он сказал ""да"""');
  });
  it("разделитель и переводы строк требуют кавычек", () => {
    expect(escapeCsvCell("a;b")).toBe('"a;b"');
    expect(escapeCsvCell("a\nb")).toBe('"a\nb"');
  });
  it("запятая — не разделитель", () => {
    expect(escapeCsvCell("a,b")).toBe("a,b");
  });
  it("null, boolean, дробные числа", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell(true)).toBe("Да");
    expect(escapeCsvCell(1.5)).toBe("1,5");
    expect(escapeCsvCell(Number.NaN)).toBe("");
  });
  it("формула с кавычкой защищается и экранируется", () => {
    expect(escapeCsvCell('=A1;"x"')).toBe(`"'=A1;""x"""`);
  });
});

describe("toCsv", () => {
  it("BOM, разделитель ; и CRLF", () => {
    const out = toCsv(["ФИО", "Часы"], [["Иванов", 8], ["=x", null]]);
    expect(out.startsWith(CSV_BOM)).toBe(true);
    expect(out.slice(1)).toBe("ФИО;Часы\r\nИванов;8\r\n'=x;\r\n");
  });
});
