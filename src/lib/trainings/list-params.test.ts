import { describe, expect, it } from "vitest";
import { listQuery, parseListParams } from "./list-params";

describe("parseListParams", () => {
  it("значения по умолчанию", () => {
    expect(parseListParams({})).toEqual({ year: null, status: null, source: null, q: "", page: 1, archived: false });
  });
  it("валидные значения", () => {
    expect(parseListParams({ year: "2025", status: "COMPLETED", source: "UNPLANNED", q: "Excel", page: "3", archived: "1" })).toEqual({
      year: 2025, status: "COMPLETED", source: "UNPLANNED", q: "Excel", page: 3, archived: true,
    });
  });
  it("мусор отбрасывается", () => {
    const p = parseListParams({ year: "20x5", status: "HACK", source: "x", page: "-4" });
    expect(p).toMatchObject({ year: null, status: null, source: null, page: 1 });
  });
  it("поиск очищается от спецсимволов фильтра", () => {
    expect(parseListParams({ q: "a%b_c,(d)*\\e" }).q).toBe("a b c d e");
    expect(parseListParams({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
  it("берёт первое значение из массива", () => {
    expect(parseListParams({ year: ["2024", "2025"] }).year).toBe(2024);
  });
});

describe("listQuery", () => {
  it("собирает и меняет параметры; страница 1 не пишется", () => {
    const p = parseListParams({ year: "2025", status: "COMPLETED", page: "2" });
    expect(listQuery(p)).toBe("?year=2025&status=COMPLETED&page=2");
    expect(listQuery(p, { page: 1 })).toBe("?year=2025&status=COMPLETED");
    expect(listQuery({})).toBe("");
  });
});
