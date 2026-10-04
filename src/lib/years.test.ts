import { describe, expect, it } from "vitest";
import { availableYears, parseYear } from "./years";

const now = new Date("2026-10-04T00:00:00Z");

describe("годы фильтра", () => {
  it("от следующего года до 2024", () => {
    expect(availableYears(now)).toEqual([2027, 2026, 2025, 2024]);
  });
  it("некорректный год заменяется текущим", () => {
    expect(parseYear("2025", now)).toBe(2025);
    expect(parseYear(undefined, now)).toBe(2026);
    expect(parseYear("1999", now)).toBe(2026);
    expect(parseYear("2025; drop", now)).toBe(2026);
    expect(parseYear(["2024", "2025"], now)).toBe(2024);
  });
});
