import { describe, expect, it } from "vitest";
import { examResultLabel, examResultReasonRequired, examResultTone, formatAttempt, formatScore } from "./format";
import { parseExamListParams, examListQuery } from "./list-params";
import { cancelExamSchema, createExamSchema, examCostSchema, examResultSchema } from "./schemas";
import { addEmployeeSkillSchema, upsertGoalSchema, upsertSkillSchema } from "./dossier-schemas";
import { currentSkillEntries, groupGoalsByYear } from "./dossier";

const U = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("format", () => {
  it("подписи результата и попытки", () => {
    expect(examResultLabel("PASSED")).toBe("Сдан");
    expect(examResultLabel("zzz")).toBe("—");
    expect(examResultTone("PASSED")).toBe("success");
    expect(formatAttempt(2)).toBe("Попытка 2");
    expect(formatAttempt(null)).toBe("—");
  });
  it("балл", () => {
    expect(formatScore(null)).toBe("—");
    expect(formatScore("75")).toBe("75");
    expect(formatScore(72.5)).toMatch(/72[,.]5/);
  });
  it("причина нужна только при смене уже выставленного результата", () => {
    expect(examResultReasonRequired("PENDING", "PASSED")).toBe(false);
    expect(examResultReasonRequired("FAILED", "PASSED")).toBe(true);
    expect(examResultReasonRequired("PASSED", "PASSED")).toBe(false);
  });
});

describe("list-params", () => {
  it("чистит и валидирует", () => {
    const p = parseExamListParams({ result: "PASSED", q: " Иван% (x) ", skill: "12", year: "2026", provider: "bad", page: "0" });
    expect(p).toEqual({ result: "PASSED", q: "Иван x", skill: 12, year: 2026, provider: null, page: 1 });
    expect(parseExamListParams({ result: "HACK", year: "99999" })).toMatchObject({ result: null, year: null });
    expect(examListQuery(p, 3)).toBe("?result=PASSED&q=%D0%98%D0%B2%D0%B0%D0%BD+x&skill=12&year=2026&page=3");
  });
});

describe("schemas", () => {
  it("создание экзамена", () => {
    expect(createExamSchema.safeParse({ employee_id: U, skill_id: "5", provider_id: "", exam_date: "2026-11-01" }).success).toBe(true);
    expect(createExamSchema.safeParse({ employee_id: "x", skill_id: "5", exam_date: "2026-11-01" }).success).toBe(false);
    expect(createExamSchema.safeParse({ employee_id: U, skill_id: "", exam_date: "01.11.2026" }).success).toBe(false);
  });
  it("результат: запятая в балле, пустой балл", () => {
    const a = examResultSchema.parse({ id: U, result: "PASSED", score: "72,5" });
    expect(a.score).toBe(72.5);
    expect(examResultSchema.parse({ id: U, result: "FAILED", score: "" }).score).toBeNull();
    expect(examResultSchema.safeParse({ id: U, result: "WIN" }).success).toBe(false);
    expect(examResultSchema.safeParse({ id: U, result: "PASSED", score: "abc" }).success).toBe(false);
  });
  it("стоимость", () => {
    const c = examCostSchema.parse({ exam_id: U, fee: "1 200,50", currency: "USD", funding_source: "COMPANY", fee_date: "" });
    expect(c.fee).toBe(1200.5);
    expect(c.fee_date).toBeNull();
    expect(examCostSchema.safeParse({ exam_id: U, fee: "-1", currency: "USD", funding_source: "COMPANY" }).success).toBe(false);
    expect(examCostSchema.safeParse({ exam_id: U, fee: 1, currency: "XXX", funding_source: "COMPANY" }).success).toBe(false);
  });
  it("отмена требует причину", () => {
    expect(cancelExamSchema.safeParse({ id: U, reason: "" }).success).toBe(false);
    expect(cancelExamSchema.safeParse({ id: U, reason: "Перенос" }).success).toBe(true);
  });
  it("навык, справочник и цель", () => {
    expect(addEmployeeSkillSchema.safeParse({ employee_id: U, skill_id: 3, level: "  " }).success).toBe(false);
    expect(addEmployeeSkillSchema.parse({ employee_id: U, skill_id: "3", level: "B2", achieved_on: "" }).achieved_on).toBeNull();
    expect(upsertSkillSchema.safeParse({ id: "", name: "ACCA", kind: "QUALIFICATION" }).success).toBe(true);
    expect(upsertSkillSchema.safeParse({ name: "A", kind: "QUALIFICATION" }).success).toBe(false);
    expect(upsertGoalSchema.safeParse({ employee_id: U, plan_year: "2027", title: "Сдать CAP", goal_type: "EXAM", status: "PLANNED" }).success).toBe(true);
    expect(upsertGoalSchema.safeParse({ employee_id: U, plan_year: "1900", title: "x1", goal_type: "EXAM", status: "PLANNED" }).success).toBe(false);
  });
});

describe("dossier logic", () => {
  it("актуальный уровень — последняя запись по навыку", () => {
    const rows = [
      { id: "1", skill_id: 1, achieved_on: "2025-01-01", created_at: "2025-01-01T10:00:00Z" },
      { id: "2", skill_id: 1, achieved_on: "2026-01-01", created_at: "2026-01-02T10:00:00Z" },
      { id: "3", skill_id: 1, achieved_on: "2026-01-01", created_at: "2026-01-03T10:00:00Z" },
      { id: "4", skill_id: 2, achieved_on: "2024-05-05", created_at: "2024-05-05T10:00:00Z" },
    ];
    const cur = currentSkillEntries(rows).map((r) => r.id).sort();
    expect(cur).toEqual(["3", "4"]);
  });
  it("цели по годам", () => {
    const g = groupGoalsByYear([
      { plan_year: 2026, due_date: null, title: "б" },
      { plan_year: 2027, due_date: "2027-03-01", title: "а" },
      { plan_year: 2026, due_date: "2026-05-01", title: "в" },
    ]);
    expect(g.map((x) => x.year)).toEqual([2027, 2026]);
    expect(g[1]!.goals.map((x) => x.title)).toEqual(["в", "б"]);
  });
});
