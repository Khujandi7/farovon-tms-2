import { describe, expect, it } from "vitest";
import { fundingQuery, parseFundingParams, safeLike } from "./params";

describe("parseFundingParams", () => {
  it("значения по умолчанию", () => {
    expect(parseFundingParams({})).toEqual({ status: null, q: "", year: null, page: 1 });
  });
  it("валидные фильтры", () => {
    expect(parseFundingParams({ status: "REPAID", year: "2026", page: "3", q: " Иванов " })).toEqual({ status: "REPAID", year: 2026, page: 3, q: "Иванов" });
  });
  it("мусор отбрасывается", () => {
    expect(parseFundingParams({ status: "HACK", year: "20x6", page: "-4" })).toEqual({ status: null, q: "", year: null, page: 1 });
  });
});

describe("safeLike / fundingQuery", () => {
  it("убирает служебные символы фильтра", () => {
    expect(safeLike("a%b,c(d)_e")).toBe("a b c d  e");
  });
  it("собирает строку запроса", () => {
    expect(fundingQuery({ status: "ACTIVE", year: 2026, page: 2 })).toBe("?status=ACTIVE&year=2026&page=2");
    expect(fundingQuery({})).toBe("");
  });
});
