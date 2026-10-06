import { describe, expect, it } from "vitest";
import { APP_ROLES, SECTION_ACCESS, canAccessSection, canWrite, isAppRole } from "./roles";

describe("роли", () => {
  it("ровно пять ролей системы", () => {
    expect([...APP_ROLES].sort()).toEqual(["ACADEMY_MANAGER", "ADMIN", "FINANCE", "HR", "VIEWER"]);
    expect(isAppRole("ADMIN")).toBe(true);
    expect(isAppRole("SUPERUSER")).toBe(false);
    expect(isAppRole(null)).toBe(false);
  });

  it("бюджет повторяет RLS fin_read: HR не видит", () => {
    expect(canAccessSection("HR", "budget")).toBe(false);
    for (const r of ["ADMIN", "ACADEMY_MANAGER", "FINANCE", "VIEWER"] as const) expect(canAccessSection(r, "budget")).toBe(true);
  });

  it("качество данных повторяет RLS dq_issues: VIEWER не видит", () => {
    expect(canAccessSection("VIEWER", "data-quality")).toBe(false);
    for (const r of ["ADMIN", "ACADEMY_MANAGER", "FINANCE", "HR"] as const) expect(canAccessSection(r, "data-quality")).toBe(true);
  });

  it("без роли нет доступа ни к одному разделу", () => {
    for (const section of Object.keys(SECTION_ACCESS) as (keyof typeof SECTION_ACCESS)[]) {
      expect(canAccessSection(null, section)).toBe(false);
      expect(canAccessSection(undefined, section)).toBe(false);
    }
  });

  it("права на запись повторяют RLS", () => {
    expect(canWrite("FINANCE", "expenses")).toBe(true);
    expect(canWrite("ACADEMY_MANAGER", "expenses")).toBe(true);
    expect(canWrite("HR", "employees")).toBe(true);
    expect(canWrite("VIEWER", "trainings")).toBe(false);
    expect(canWrite("ACADEMY_MANAGER", "users")).toBe(false);
    expect(canWrite("ADMIN", "users")).toBe(true);
    expect(canWrite(null, "trainings")).toBe(false);
  });
});
