import { describe, expect, it } from "vitest";
import { agreementActions, agreementStatusLabel, agreementStatusVariant, agreementSteps, outcomeLabel, policyState } from "./status";

describe("форматирование статусов", () => {
  it("русские подписи для всех статусов", () => {
    expect(agreementStatusLabel("ACTIVE")).toBe("Действует");
    expect(agreementStatusLabel("OBLIGATION_CREATED")).toBe("Обязательство создано");
    expect(agreementStatusLabel("PARTIALLY_REPAID")).toBe("Погашено частично");
    expect(agreementStatusLabel("REPAID")).toBe("Погашено");
    expect(agreementStatusLabel("CANCELLED")).toBe("Отменено");
    expect(agreementStatusLabel("UNKNOWN")).toBe("UNKNOWN");
  });
  it("варианты бейджей", () => {
    expect(agreementStatusVariant("REPAID")).toBe("success");
    expect(agreementStatusVariant("OBLIGATION_CREATED")).toBe("warning");
    expect(agreementStatusVariant("???")).toBe("secondary");
  });
  it("исходы и состояние политики", () => {
    expect(outcomeLabel("FAILED")).toBe("Не сдан");
    expect(outcomeLabel(null)).toBe("—");
    expect(policyState({ confirmed_at: null, is_active: true })).toBe("DRAFT");
    expect(policyState({ confirmed_at: "2026-01-01", is_active: true })).toBe("CONFIRMED");
    expect(policyState({ confirmed_at: "2026-01-01", is_active: false })).toBe("DISABLED");
  });
});

describe("agreementSteps", () => {
  it("до расчёта текущий шаг — расчёт", () => {
    const s = agreementSteps({ status: "ACTIVE", evaluated_at: null, reviewed_at: null, repayment_amount: 0 });
    expect(s.find((x) => x.key === "evaluated")?.state).toBe("current");
    expect(s.find((x) => x.key === "review")?.state).toBe("todo");
  });
  it("после расчёта ждёт проверки", () => {
    const s = agreementSteps({ status: "OBLIGATION_CREATED", evaluated_at: "x", reviewed_at: null, repayment_amount: 500 });
    expect(s.find((x) => x.key === "review")?.state).toBe("current");
  });
  it("после проверки — погашение", () => {
    const s = agreementSteps({ status: "PARTIALLY_REPAID", evaluated_at: "x", reviewed_at: "y", repayment_amount: 500 });
    expect(s.find((x) => x.key === "repay")?.state).toBe("current");
  });
  it("без обязательства проверка и погашение пропускаются", () => {
    const s = agreementSteps({ status: "COMPLETED", evaluated_at: "x", reviewed_at: null, repayment_amount: 0 });
    expect(s.filter((x) => x.state === "skipped")).toHaveLength(2);
  });
  it("отменённое соглашение", () => {
    expect(agreementSteps({ status: "CANCELLED", evaluated_at: null, reviewed_at: null, repayment_amount: 0 })).toHaveLength(1);
  });
});

describe("agreementActions", () => {
  const ob = { status: "OBLIGATION_CREATED", evaluated_at: "x", reviewed_at: null, repayment_amount: 500 };
  it("ACADEMY_MANAGER рассчитывает, но не проверяет и не вносит погашения", () => {
    const a = agreementActions(ob, "ACADEMY_MANAGER", 0, 500);
    expect(a.evaluate).toBe(true);
    expect(a.review).toBe(false);
    expect(a.record).toBe(false);
    expect(a.cancel).toBe(false);
  });
  it("FINANCE проверяет; погашение только после проверки", () => {
    expect(agreementActions(ob, "FINANCE", 0, 500).review).toBe(true);
    expect(agreementActions(ob, "FINANCE", 0, 500).record).toBe(false);
    const reviewed = { ...ob, reviewed_at: "y" };
    expect(agreementActions(reviewed, "FINANCE", 0, 500).record).toBe(true);
    expect(agreementActions(reviewed, "FINANCE", 0, 0).record).toBe(false);
  });
  it("при действующих погашениях пересчёт недоступен, аннулирование доступно", () => {
    const a = agreementActions({ ...ob, status: "PARTIALLY_REPAID", reviewed_at: "y" }, "ADMIN", 1, 200);
    expect(a.evaluate).toBe(false);
    expect(a.void).toBe(true);
  });
  it("HR и VIEWER ничего не могут; у отменённого действий нет", () => {
    for (const role of ["HR", "VIEWER"] as const) expect(Object.values(agreementActions(ob, role, 0, 500)).some(Boolean)).toBe(false);
    expect(Object.values(agreementActions({ ...ob, status: "CANCELLED" }, "ADMIN", 0, 0)).some(Boolean)).toBe(false);
  });
});
