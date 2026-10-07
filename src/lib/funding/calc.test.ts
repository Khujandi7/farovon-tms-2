import { describe, expect, it } from "vitest";
import { computeShares, obligationAmount, outstandingAmount, summarizeAgreements, toTjs, validateRepayment } from "./calc";

describe("computeShares", () => {
  it("делит стоимость по доле компании", () => {
    expect(computeShares(1000, 70)).toEqual({ company: 700, employee: 300, companyPercent: 70, employeePercent: 30 });
  });
  it("округляет до копеек так же, как БД", () => {
    const s = computeShares(100, 33.33);
    expect(s?.company).toBe(33.33);
    expect(s?.employee).toBe(66.67);
  });
  it("крайние значения", () => {
    expect(computeShares(500, 0)?.company).toBe(0);
    expect(computeShares(500, 100)?.employee).toBe(0);
  });
  it("некорректный ввод даёт null", () => {
    expect(computeShares(-1, 50)).toBeNull();
    expect(computeShares(100, 101)).toBeNull();
    expect(computeShares(100, -5)).toBeNull();
    expect(computeShares(Number.NaN, 50)).toBeNull();
  });
});

describe("obligationAmount / outstandingAmount", () => {
  it("считает обязательство по проценту ответственности", () => {
    expect(obligationAmount(2000, 50)).toBe(1000);
    expect(obligationAmount(2000, 0)).toBe(0);
    expect(obligationAmount(2000, 120)).toBeNull();
  });
  it("остаток не уходит в минус", () => {
    expect(outstandingAmount(1000, 400)).toBe(600);
    expect(outstandingAmount(1000, 1000)).toBe(0);
    expect(outstandingAmount(1000, 1200)).toBe(0);
    expect(outstandingAmount(100, 33.33)).toBe(66.67);
  });
});

describe("toTjs", () => {
  it("пересчитывает по зафиксированному соотношению", () => {
    expect(toTjs(50, 100, 1100)).toBe(550);
  });
  it("без курса возвращает null", () => {
    expect(toTjs(50, 100, null)).toBeNull();
  });
});

describe("summarizeAgreements", () => {
  const base = { company_funded_amount: 0, repayment_amount: 0 };
  it("суммирует в TJS, пропускает отменённые и без курса", () => {
    const rows = [
      { id: "a", status: "ACTIVE", total_cost: 100, total_cost_tjs: 1000, ...base, company_funded_amount: 70 },
      { id: "b", status: "PARTIALLY_REPAID", total_cost: 200, total_cost_tjs: 200, company_funded_amount: 0, repayment_amount: 100 },
      { id: "c", status: "CANCELLED", total_cost: 999, total_cost_tjs: 999, ...base },
      { id: "d", status: "ACTIVE", total_cost: 50, total_cost_tjs: null, ...base },
    ];
    const t = summarizeAgreements(rows, { b: 40 });
    expect(t.count).toBe(2);
    expect(t.skipped).toBe(1);
    expect(t.totalTjs).toBe(1200);
    expect(t.companyTjs).toBe(700);
    expect(t.employeeTjs).toBe(500);
    expect(t.outstandingTjs).toBe(60);
  });
  it("пустой список", () => {
    expect(summarizeAgreements([], {})).toEqual({ totalTjs: 0, companyTjs: 0, employeeTjs: 0, outstandingTjs: 0, count: 0, skipped: 0 });
  });
});

describe("validateRepayment", () => {
  it("принимает сумму в пределах остатка", () => {
    expect(validateRepayment(100, 100)).toBeNull();
  });
  it("отклоняет ноль, отрицательные и превышение остатка", () => {
    expect(validateRepayment(0, 100)).not.toBeNull();
    expect(validateRepayment(-5, 100)).not.toBeNull();
    expect(validateRepayment(100.01, 100)).not.toBeNull();
    expect(validateRepayment(Number.NaN, 100)).not.toBeNull();
  });
});
