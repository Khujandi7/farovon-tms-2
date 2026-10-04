import { describe, expect, it } from "vitest";
import { EMPTY_VALUE, formatDate, formatDateRange, formatMoney, formatNumber, formatPercent } from "./format";

const nbsp = (s: string) => s.replace(/ | /g, " ");

describe("форматирование: NULL — это «нет данных», не ноль", () => {
  it("NULL и undefined дают прочерк", () => {
    expect(formatMoney(null)).toBe(EMPTY_VALUE);
    expect(formatNumber(undefined)).toBe(EMPTY_VALUE);
    expect(formatPercent(null)).toBe(EMPTY_VALUE);
    expect(formatDate(null)).toBe(EMPTY_VALUE);
  });
  it("настоящий ноль остаётся нулём", () => {
    expect(formatMoney(0)).toBe("0 TJS");
    expect(formatNumber(0)).toBe("0");
  });
  it("значения из БД не округляются сверх 2 знаков и не пересчитываются", () => {
    expect(nbsp(formatMoney(121085))).toBe("121 085 TJS");
    expect(nbsp(formatMoney(2421.7))).toBe("2 421,7 TJS");
    expect(formatMoney(1000, "USD")).toMatch(/USD$/);
  });
  it("даты из БД", () => {
    expect(formatDate("2025-07-13")).toBe("13.07.2025");
    expect(formatDateRange("2025-07-13", "2025-07-26")).toBe("13.07.2025 – 26.07.2025");
    expect(formatDateRange("2025-07-13", "2025-07-13")).toBe("13.07.2025");
  });
});
