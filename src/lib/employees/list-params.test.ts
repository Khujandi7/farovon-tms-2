import { describe, expect, it } from "vitest";
import { employeeExportParams, employeeListQuery, parseEmployeeListParams } from "./list-params";
import { exportHref } from "@/lib/export/href";
import { parseExportRequest, parseFormat } from "@/lib/export/params";

describe("parseEmployeeListParams", () => {
  it("значения по умолчанию", () => {
    expect(parseEmployeeListParams({})).toEqual({ q: "", dept: null, unit: null, status: "active", remarks: false, sort: "name", dir: "asc", page: 1 });
  });
  it("отбрасывает мусор и чистит поиск", () => {
    const p = parseEmployeeListParams({ q: "  Иванов,(x)%  ", dept: "abc", unit: "-1", status: "zzz", sort: "drop table", dir: "up", page: "-3" });
    expect(p).toMatchObject({ q: "Иванов x", dept: null, unit: null, status: "active", sort: "name", dir: "asc", page: 1 });
  });
  it("разбирает валидные значения", () => {
    const p = parseEmployeeListParams({ q: "000123", dept: "5", unit: "9", status: "all", remarks: "1", sort: "code", dir: "desc", page: "3" });
    expect(p).toEqual({ q: "000123", dept: 5, unit: 9, status: "all", remarks: true, sort: "code", dir: "desc", page: 3 });
  });
  it("старая ссылка inactive=1", () => {
    expect(parseEmployeeListParams({ inactive: "1" }).status).toBe("inactive");
  });
  it("не принимает массив как ошибку", () => {
    expect(parseEmployeeListParams({ q: ["a", "b"] }).q).toBe("a");
  });
});

describe("employeeListQuery / экспорт", () => {
  it("значения по умолчанию в URL не пишутся", () => {
    expect(employeeListQuery(parseEmployeeListParams({}))).toBe("");
  });
  it("round-trip", () => {
    const p = parseEmployeeListParams({ q: "ив", dept: "2", status: "inactive", sort: "position", dir: "desc", page: "2" });
    expect(parseEmployeeListParams(Object.fromEntries(new URLSearchParams(employeeListQuery(p))))).toEqual(p);
  });
  it("параметры выгрузки не содержат страницу", () => {
    const o = employeeExportParams(parseEmployeeListParams({ q: "ив", page: "4", remarks: "1" }));
    expect(o).toMatchObject({ q: "ив", remarks: "1" });
    expect(o).not.toHaveProperty("page");
  });
});

describe("parseExportRequest / exportHref", () => {
  it("неизвестная сущность", () => {
    expect(parseExportRequest("users", {})).toBeNull();
  });
  it("участники: training_id только uuid", () => {
    expect(parseExportRequest("participants", { training_id: "nope" })).toEqual({ entity: "participants", filters: { trainingId: null } });
    const id = "3f2b8c1e-5a4d-4c3b-9e1f-0a1b2c3d4e5f";
    expect(parseExportRequest("participants", { training_id: id })).toEqual({ entity: "participants", filters: { trainingId: id } });
  });
  it("экзамены и соглашения отбрасывают неизвестные значения", () => {
    expect(parseExportRequest("exams", { result: "HACK", year: "20x6" })).toMatchObject({ filters: { result: null, year: null } });
    expect(parseExportRequest("agreements", { status: "REPAID" })).toMatchObject({ filters: { status: "REPAID" } });
  });
  it("формат по умолчанию csv", () => {
    expect(parseFormat("xlsx")).toBe("xlsx");
    expect(parseFormat("pdf")).toBe("csv");
    expect(parseFormat(null)).toBe("csv");
  });
  it("exportHref пропускает пустые значения и подменяет format", () => {
    expect(exportHref("exams", "xlsx", { year: 2026, q: "", employee_id: null, format: "csv", page: 3 })).toBe("/export/exams?year=2026&format=xlsx");
  });
});
