import { describe, expect, it } from "vitest";
import { agreementPatchSchema, createAgreementSchema, policySchema, repaymentSchema } from "./schemas";

const id = "11111111-1111-4111-8111-111111111111";
const id2 = "22222222-2222-4222-8222-222222222222";

describe("policySchema", () => {
  const ok = { name: "Политика 2026", scope: "EXAM", company_coverage_percent: "70", currency: "", effective_from: "2026-01-01", effective_to: "", basis: "", outcomes: { PASSED: "0", FAILED: "100" } };
  it("принимает корректную политику и приводит типы", () => {
    const r = policySchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.company_coverage_percent).toBe(70);
      expect(r.data.currency).toBeNull();
      expect(r.data.effective_to).toBeNull();
      expect(r.data.outcomes).toEqual({ PASSED: 0, FAILED: 100 });
    }
  });
  it("отклоняет проценты вне 0..100", () => {
    expect(policySchema.safeParse({ ...ok, company_coverage_percent: "101" }).success).toBe(false);
    expect(policySchema.safeParse({ ...ok, outcomes: { FAILED: "150" } }).success).toBe(false);
  });
  it("требует хотя бы один исход и допустимые ключи", () => {
    expect(policySchema.safeParse({ ...ok, outcomes: {} }).success).toBe(false);
    expect(policySchema.safeParse({ ...ok, outcomes: { BOGUS: 1 } }).success).toBe(false);
  });
  it("окончание не раньше начала", () => {
    const r = policySchema.safeParse({ ...ok, effective_to: "2025-12-31" });
    expect(r.success).toBe(false);
  });
});

describe("createAgreementSchema", () => {
  const base = { employee_id: id, training_id: id2, total_cost: "1000", company_coverage_percent: "70", currency: "TJS" };
  it("принимает обучение со стоимостью и долей", () => {
    expect(createAgreementSchema.safeParse(base).success).toBe(true);
  });
  it("нужна цель: обучение или экзамен, но не оба", () => {
    expect(createAgreementSchema.safeParse({ ...base, training_id: "" }).success).toBe(false);
    expect(createAgreementSchema.safeParse({ ...base, exam_id: id }).success).toBe(false);
  });
  it("для экзамена стоимость необязательна, для обучения — обязательна", () => {
    expect(createAgreementSchema.safeParse({ employee_id: id, exam_id: id2, company_coverage_percent: 50 }).success).toBe(true);
    expect(createAgreementSchema.safeParse({ ...base, total_cost: "" }).success).toBe(false);
  });
  it("нужна доля компании или политика", () => {
    expect(createAgreementSchema.safeParse({ ...base, company_coverage_percent: "" }).success).toBe(false);
    expect(createAgreementSchema.safeParse({ ...base, company_coverage_percent: "", policy_id: id2 }).success).toBe(true);
  });
  it("отклоняет отрицательную стоимость и неверную валюту", () => {
    expect(createAgreementSchema.safeParse({ ...base, total_cost: "-1" }).success).toBe(false);
    expect(createAgreementSchema.safeParse({ ...base, currency: "XXX" }).success).toBe(false);
  });
});

describe("repaymentSchema / agreementPatchSchema", () => {
  it("погашение: положительная сумма и дата", () => {
    expect(repaymentSchema.safeParse({ agreementId: id, amount: "100,5".replace(",", "."), paid_on: "2026-05-01" }).success).toBe(true);
    expect(repaymentSchema.safeParse({ agreementId: id, amount: 0, paid_on: "2026-05-01" }).success).toBe(false);
    expect(repaymentSchema.safeParse({ agreementId: id, amount: 10, paid_on: "01.05.2026" }).success).toBe(false);
  });
  it("патч не пропускает поля стоимости и статуса", () => {
    const r = agreementPatchSchema.safeParse({ contract_number: " 12/А ", total_cost: 1, status: "REPAID" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({ contract_number: "12/А" });
    }
  });
});
