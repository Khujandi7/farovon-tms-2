import { describe, expect, it } from "vitest";
import { actionsFor, planFact, ruleTitle } from "./catalog";

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
