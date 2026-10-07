import { describe, expect, it } from "vitest";
import { parseTab, timelineHref, visibleTabs } from "./tabs";

describe("вкладки досье", () => {
  it("HR и VIEWER не видят договоры и затраты", () => {
    for (const r of ["HR", "VIEWER"] as const) {
      const ids = visibleTabs(r).map((t) => t.id);
      expect(ids).not.toContain("contracts");
      expect(ids).not.toContain("costs");
    }
    expect(visibleTabs("FINANCE").map((t) => t.id)).toContain("costs");
    expect(visibleTabs("ADMIN")).toHaveLength(13);
  });
  it("неизвестная или недоступная вкладка → обзор", () => {
    expect(parseTab("nope", "ADMIN")).toBe("overview");
    expect(parseTab("costs", "HR")).toBe("overview");
    expect(parseTab(["exams"], "HR")).toBe("exams");
    expect(parseTab(undefined, null)).toBe("overview");
  });
  it("ссылки хронологии", () => {
    expect(timelineHref("trainings", "t1", "e1")).toBe("/trainings/t1");
    expect(timelineHref("certificates", "c1", "e1")).toBe("/employees/e1?tab=certificates");
    expect(timelineHref("unknown", "x", "e1")).toBeNull();
  });
});
