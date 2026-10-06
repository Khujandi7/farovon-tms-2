import { describe, expect, it } from "vitest";
import { APP_ROLES, type AppRole } from "@/lib/auth/roles";
import { can, canRevertTable } from "./roles";

describe("матрица ролей Phase 3", () => {
  const allowed = (area: Parameters<typeof can>[1]) => APP_ROLES.filter((r) => can(r, area));
  it("тренинги и заявки: ADMIN, ACADEMY_MANAGER", () => {
    expect(allowed("training")).toEqual(["ADMIN", "ACADEMY_MANAGER"]);
    expect(allowed("request")).toEqual(["ADMIN", "ACADEMY_MANAGER"]);
  });
  it("участники и посещаемость: + HR", () => {
    expect(allowed("participants")).toEqual(["ADMIN", "ACADEMY_MANAGER", "HR"]);
    expect(allowed("attendance")).toEqual(["ADMIN", "ACADEMY_MANAGER", "HR"]);
  });
  it("расходы: менеджер и финансы создают, сторно только ADMIN и FINANCE", () => {
    expect(allowed("expense")).toEqual(["ADMIN", "ACADEMY_MANAGER", "FINANCE"]);
    expect(allowed("expenseVoid")).toEqual(["ADMIN", "FINANCE"]);
  });
  it("HR и VIEWER не видят денег; VIEWER ничего не пишет", () => {
    expect(can("HR", "financialRead")).toBe(false);
    for (const area of ["training", "request", "participants", "attendance", "expense", "employee", "dq"] as const) {
      expect(can("VIEWER", area)).toBe(false);
    }
  });
  it("откат: расходы не откатываются", () => {
    expect(canRevertTable("ADMIN", "expense_operations")).toBe(false);
    expect(canRevertTable("HR", "trainings")).toBe(false);
    expect(canRevertTable("HR", "session_attendance")).toBe(true);
    expect(canRevertTable("ACADEMY_MANAGER", "training_sessions")).toBe(true);
    expect(canRevertTable("VIEWER" as AppRole, "trainings")).toBe(false);
    expect(canRevertTable(null, "trainings")).toBe(false);
  });
});
