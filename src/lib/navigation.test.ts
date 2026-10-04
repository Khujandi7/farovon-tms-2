import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isActivePath, navItemsForRole } from "./navigation";

describe("навигация", () => {
  it("восемь разделов в утверждённом порядке", () => {
    expect(NAV_ITEMS.map((i) => i.id)).toEqual(["dashboard", "trainings", "employees", "budget", "feedback", "reports", "data-quality", "settings"]);
  });
  it("ADMIN видит всё, HR — без бюджета, VIEWER — без качества данных, без роли — ничего", () => {
    expect(navItemsForRole("ADMIN")).toHaveLength(8);
    expect(navItemsForRole("HR").map((i) => i.id)).not.toContain("budget");
    expect(navItemsForRole("VIEWER").map((i) => i.id)).not.toContain("data-quality");
    expect(navItemsForRole(null)).toEqual([]);
  });
  it("активный пункт", () => {
    expect(isActivePath("/trainings/123", "/trainings")).toBe(true);
    expect(isActivePath("/trainings-x", "/trainings")).toBe(false);
  });
});
