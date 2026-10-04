import { describe, expect, it } from "vitest";
import { buildKpiCards, type KpiYearRow } from "./kpi";

const nbsp = (s: string) => s.replace(/ | /g, " ");

// Значения — как их вернула бы kpi_year() (взяты из тестов Phase 1.5, не реальные данные)
const granted: KpiYearRow = {
  financial_access: "GRANTED",
  plan_status: "OK",
  plan_usd: 1000,
  plan_tjs: 11000,
  financial_actual_tjs: 4200,
  variance_tjs: -6800,
  delivered_count: 3,
  delivered_unique_participants: 4,
  delivered_man_hours: 56,
  in_progress_count: 1,
  unplanned_delivered_count: 2,
  unplanned_delivered_pct: 66.67,
  unplanned_unconfirmed_count: 1,
  unplanned_financial_actual_tjs: 1200,
};

const byId = (row: KpiYearRow) => Object.fromEntries(buildKpiCards(row).map((c) => [c.id, c]));

describe("buildKpiCards", () => {
  it("показывает значения из БД без пересчёта", () => {
    const c = byId(granted);
    expect(nbsp(c.actual!.value)).toBe("4 200 TJS");
    expect(nbsp(c.plan!.value)).toBe("11 000 TJS");
    expect(nbsp(c.variance!.value)).toBe("-6 800 TJS");
    expect(c.delivered!.value).toBe("3");
    expect(c.in_progress!.value).toBe("1");
    expect(nbsp(c.unplanned_actual!.value)).toBe("1 200 TJS");
    expect(c.unplanned!.hint).toContain("66,67 %");
  });

  it("HR: финансовые карточки «Нет доступа», а не 0; нефинансовые доступны", () => {
    const row: KpiYearRow = {
      ...granted,
      financial_access: "FINANCIAL_DATA_RESTRICTED",
      plan_status: null,
      plan_usd: null,
      plan_tjs: null,
      financial_actual_tjs: null,
      variance_tjs: null,
      unplanned_financial_actual_tjs: null,
    };
    const cards = buildKpiCards(row);
    for (const card of cards.filter((c) => c.financial)) {
      expect(card.state).toBe("restricted");
      expect(card.value).toBe("Нет доступа");
      expect(card.value).not.toMatch(/\d/);
    }
    expect(cards.find((c) => c.id === "delivered")!.value).toBe("3");
  });

  it("нет утверждённого плана: «Не утверждён», отклонение — прочерк", () => {
    const c = byId({ ...granted, plan_status: "NO_APPROVED_VERSION", plan_usd: null, plan_tjs: null, variance_tjs: null });
    expect(c.plan!.state).toBe("no_plan");
    expect(c.plan!.value).toBe("Не утверждён");
    expect(c.variance!.value).toBe("—");
    expect(nbsp(c.actual!.value)).toBe("4 200 TJS");
  });

  it("нет бюджетного курса: план в USD и предупреждение", () => {
    const c = byId({ ...granted, plan_status: "NO_FX", plan_tjs: null, variance_tjs: null });
    expect(c.plan!.state).toBe("no_fx");
    expect(c.plan!.value).toMatch(/USD/);
    expect(c.variance!.state).toBe("no_fx");
  });
});
