import { describe, expect, it } from "vitest";
import { DQ_RULES, actionsFor, planFact, ruleDescription, ruleTitle } from "./catalog";

const base = { entity_table: "trainings", entity_id: "abc", details: null };

describe("каталог действий Data Quality", () => {
  it("у каждой проблемы тренинга есть «Открыть» и «Оставить на проверке»", () => {
    for (const code of ["TRAINING_NO_PARTICIPANTS", "TRAINING_DONE_IN_FUTURE", "TRAINING_PLANNED_IN_PAST", "TRAINING_HOURS_MISMATCH", "PARTICIPANTS_PLAN_VS_FACT", "SRC_PLANNED_NO_REQUEST", "SRC_CANDIDATE_UNCONFIRMED"]) {
      const kinds = actionsFor({ ...base, rule_code: code }).map((a) => a.kind);
      expect(kinds, code).toContain("open");
      expect(kinds, code).toContain("review");
    }
  });
  it("ссылки ведут в нужные вкладки карточки", () => {
    const a = actionsFor({ ...base, rule_code: "TRAINING_NO_PARTICIPANTS" });
    expect(a.find((x) => x.kind === "choose")?.href).toBe("/trainings/abc?tab=participants");
    expect(actionsFor({ ...base, rule_code: "TRAINING_HOURS_MISMATCH" }).find((x) => x.kind === "fix")?.href).toBe("/trainings/abc?tab=sessions");
  });
  it("заявка без тренинга: «Связать» и переход на заявку", () => {
    const a = actionsFor({ entity_table: "training_requests", entity_id: "r1", details: null, rule_code: "REQUEST_NO_TRAINING" });
    expect(a.map((x) => x.kind)).toContain("link-training");
    expect(a.find((x) => x.kind === "open")?.href).toBe("/trainings/requests/r1");
  });
  it("сотрудники ведут в справочник", () => {
    expect(actionsFor({ entity_table: "employees", entity_id: "e1", details: null, rule_code: "EMPLOYEE_NO_UNIT" }).find((x) => x.kind === "open")?.href).toBe("/employees/e1");
  });
  it("неизвестное правило: оставить на проверке или подтвердить", () => {
    expect(actionsFor({ ...base, rule_code: "UNKNOWN" }).map((x) => x.kind)).toEqual(["review", "confirm"]);
    expect(ruleTitle("UNKNOWN")).toBe("Замечание");
  });
  it("без сущности нет ссылок", () => {
    expect(actionsFor({ entity_table: null, entity_id: null, details: null, rule_code: "TRAINING_NO_PARTICIPANTS" }).every((a) => !a.href)).toBe(true);
  });
  it("план/факт из details", () => {
    expect(planFact({ plan: 20, fact: 15 })).toEqual({ plan: 20, fact: 15 });
    expect(planFact({ plan: null, fact: 3 })).toBeNull();
    expect(planFact(null)).toBeNull();
  });
});

const NEW_CODES = [
  "PARTICIPANT_DUPLICATE_PERSON", "CERT_EXPIRED", "CERT_EXPIRING", "EXAM_NO_RESULT", "EXAM_PASSED_NO_CERT", "FUNDING_NO_CONTRACT", "AGREEMENT_NO_CONTRACT",
  "EDU_FUNDED_NO_AGREEMENT", "FAILED_EXAM_NO_POLICY", "AGREEMENT_NOT_EVALUATED", "OBLIGATION_NOT_REVIEWED", "CONTRACT_EXPIRING", "EXPENSE_NO_FX",
];
const IMPORT_CODES = ["IMPORT_EMPLOYEE_NOT_FOUND", "IMPORT_EMPLOYEE_AMBIGUOUS", "IMPORT_EMPLOYEE_FUZZY", "IMPORT_UNIT_UNKNOWN", "IMPORT_SKILL_UNKNOWN", "IMPORT_TYPE_UNKNOWN", "IMPORT_REVIEW"];

describe("правила Phase 3A.1", () => {
  const issue = (rule_code: string, entity_table: string, entity_id: string, details: Record<string, unknown> | null = null) => ({ rule_code, entity_table, entity_id, details });
  const E = "00000000-0000-4000-8000-0000000000e1";

  it("у каждого нового правила есть название, описание и «Оставить на проверке»", () => {
    for (const code of [...NEW_CODES, ...IMPORT_CODES]) {
      expect(DQ_RULES[code], code).toBeDefined();
      expect(ruleTitle(code), code).not.toBe("Замечание");
      expect(ruleDescription(code).length, code).toBeGreaterThan(10);
      expect(actionsFor(issue(code, "x", "abc", { employee_id: E, training_id: E })).map((a) => a.kind), code).toContain("review");
    }
  });
  it("каждое действие со ссылкой ведёт на внутреннюю страницу", () => {
    for (const code of [...NEW_CODES, ...IMPORT_CODES]) {
      for (const a of actionsFor(issue(code, "x", "abc", { employee_id: E, training_id: E }))) {
        if (a.href) expect(a.href, `${code}/${a.kind}`).toMatch(/^\/[a-z]/);
      }
    }
  });
  it("экзамен и соглашение", () => {
    expect(actionsFor(issue("EXAM_NO_RESULT", "exams", "x1")).find((a) => a.kind === "open")?.href).toBe("/exams/x1");
    expect(actionsFor(issue("AGREEMENT_NO_CONTRACT", "learning_agreements", "g1")).find((a) => a.kind === "fix")?.href).toBe("/funding/g1");
    expect(actionsFor(issue("FUNDING_NO_CONTRACT", "exams", "x1")).find((a) => a.kind === "link")?.href).toBe("/funding/new?exam=x1");
  });
  it("сертификат ведёт во вкладку досье сотрудника", () => {
    expect(actionsFor(issue("CERT_EXPIRED", "certificates", "c1", { employee_id: E })).find((a) => a.kind === "open")?.href).toBe(`/employees/${E}?tab=certificates`);
    // без сотрудника — общий список сертификатов
    expect(actionsFor(issue("CERT_EXPIRING", "certificates", "c1")).find((a) => a.kind === "open")?.href).toBe("/certificates");
  });
  it("расход без курса: ссылка только при известном обучении", () => {
    expect(actionsFor(issue("EXPENSE_NO_FX", "expense_operations", "o1", { training_id: E })).find((a) => a.kind === "fix")?.href).toBe(`/trainings/${E}?tab=expenses`);
    expect(actionsFor(issue("EXPENSE_NO_FX", "expense_operations", "o1")).some((a) => a.href)).toBe(false);
  });
  it("импорт: действия ведут в /imports/[job], включая неизвестный review_code", () => {
    expect(actionsFor(issue("IMPORT_EMPLOYEE_AMBIGUOUS", "import_jobs", "j1")).find((a) => a.kind === "match")?.href).toBe("/imports/j1");
    const unknown = actionsFor(issue("IMPORT_SOMETHING_NEW", "import_jobs", "j2"));
    expect(unknown.find((a) => a.kind === "open")?.href).toBe("/imports/j2");
    expect(ruleTitle("IMPORT_SOMETHING_NEW")).toBe("Импорт: строка требует решения");
  });
  it("«решить» доступно там, где подтверждение осмысленно", () => {
    for (const code of ["CERT_EXPIRED", "EXAM_PASSED_NO_CERT", "FAILED_EXAM_NO_POLICY", "CONTRACT_EXPIRING", "PARTICIPANT_DUPLICATE_PERSON"]) {
      expect(actionsFor(issue(code, "x", "abc", { employee_id: E })).map((a) => a.kind), code).toContain("confirm");
    }
  });
});
