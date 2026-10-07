import { describe, expect, it } from "vitest";
import type { AppRole } from "@/lib/auth/roles";
import { canExport, columnsFor, exportFileName, isExportEntity, EXPORT_COLUMNS } from "./columns";

const keys = (e: Parameters<typeof columnsFor>[0], r: AppRole) => columnsFor(e, r).map((c) => c.key);

describe("выбор колонок по роли", () => {
  it("HR и VIEWER получают экзамены без стоимости", () => {
    for (const r of ["HR", "VIEWER"] as const) {
      expect(keys("exams", r)).not.toContain("fee");
      expect(keys("exams", r)).not.toContain("fee_tjs");
      expect(keys("exams", r)).not.toContain("currency");
      expect(keys("exams", r)).toContain("result");
    }
  });
  it("ADMIN, ACADEMY_MANAGER, FINANCE видят стоимость экзаменов", () => {
    for (const r of ["ADMIN", "ACADEMY_MANAGER", "FINANCE"] as const) expect(keys("exams", r)).toContain("fee_tjs");
  });
  it("затраты по тренингам: HR без денег, VIEWER с деньгами (financialRead)", () => {
    expect(keys("trainings", "HR")).not.toContain("actual_tjs");
    expect(keys("trainings", "VIEWER")).toContain("actual_tjs");
  });
  it("сотрудники, сертификаты и участники не содержат денежных колонок", () => {
    for (const e of ["employees", "certificates", "participants"] as const) expect(EXPORT_COLUMNS[e].some((c) => c.money)).toBe(false);
  });
});

describe("доступ к выгрузке", () => {
  it("соглашения только для ADMIN/ACADEMY_MANAGER/FINANCE", () => {
    expect(canExport("FINANCE", "agreements")).toBe(true);
    expect(canExport("ACADEMY_MANAGER", "agreements")).toBe(true);
    expect(canExport("HR", "agreements")).toBe(false);
    expect(canExport("VIEWER", "agreements")).toBe(false);
    expect(canExport(null, "employees")).toBe(false);
  });
  it("остальные сущности доступны всем ролям", () => {
    expect(canExport("VIEWER", "employees")).toBe(true);
  });
  it("распознаёт сущности и формирует имя файла с датой", () => {
    expect(isExportEntity("exams")).toBe(true);
    expect(isExportEntity("users")).toBe(false);
    expect(exportFileName("employees", "xlsx", new Date("2026-10-07T10:00:00Z"))).toBe("farovon-employees-2026-10-07.xlsx");
  });
});
