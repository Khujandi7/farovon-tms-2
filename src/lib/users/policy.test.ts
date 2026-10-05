import { describe, expect, it } from "vitest";
import { canManageUsers, checkChangeRole, checkSetActive, userStatus, type ProfileLite } from "./policy";
import { ERR } from "./errors";

const admin1: ProfileLite = { id: "a1", role: "ADMIN", is_active: true };
const admin2: ProfileLite = { id: "a2", role: "ADMIN", is_active: true };
const hr: ProfileLite = { id: "h1", role: "HR", is_active: true };

describe("canManageUsers", () => {
  it("только ADMIN", () => {
    expect(canManageUsers("ADMIN")).toBe(true);
    for (const r of ["ACADEMY_MANAGER", "HR", "FINANCE", "VIEWER", null, undefined] as const) expect(canManageUsers(r)).toBe(false);
  });
});

describe("checkChangeRole", () => {
  it("себе нельзя", () => {
    expect(checkChangeRole({ actorId: "a1", target: admin1, newRole: "HR", all: [admin1, admin2] })).toEqual({ ok: false, error: ERR.self });
  });
  it("последнего активного ADMIN нельзя понизить", () => {
    expect(checkChangeRole({ actorId: "a2", target: admin1, newRole: "VIEWER", all: [admin1, { ...admin2, is_active: false }] })).toEqual({ ok: false, error: ERR.lastAdmin });
  });
  it("при двух ADMIN одного можно понизить; ADMIN → ADMIN допустим; обычного можно повысить", () => {
    expect(checkChangeRole({ actorId: "a2", target: admin1, newRole: "VIEWER", all: [admin1, admin2] }).ok).toBe(true);
    expect(checkChangeRole({ actorId: "a2", target: admin1, newRole: "ADMIN", all: [admin1] }).ok).toBe(true);
    expect(checkChangeRole({ actorId: "a1", target: hr, newRole: "ADMIN", all: [admin1, hr] }).ok).toBe(true);
  });
});

describe("checkSetActive", () => {
  it("себя деактивировать нельзя", () => {
    expect(checkSetActive({ actorId: "a1", target: admin1, active: false, all: [admin1, admin2] })).toEqual({ ok: false, error: ERR.self });
  });
  it("последнего активного ADMIN деактивировать нельзя", () => {
    expect(checkSetActive({ actorId: "x", target: admin1, active: false, all: [admin1, hr] })).toEqual({ ok: false, error: ERR.lastAdmin });
  });
  it("обычного пользователя можно деактивировать и восстановить", () => {
    expect(checkSetActive({ actorId: "a1", target: hr, active: false, all: [admin1, hr] }).ok).toBe(true);
    expect(checkSetActive({ actorId: "a1", target: { ...hr, is_active: false }, active: true, all: [admin1, hr] }).ok).toBe(true);
  });
});

describe("userStatus", () => {
  it("деактивирован > приглашён > активен", () => {
    expect(userStatus({ isActive: false, confirmedAt: "2026-01-01" })).toBe("inactive");
    expect(userStatus({ isActive: true, confirmedAt: null })).toBe("invited");
    expect(userStatus({ isActive: true, confirmedAt: "2026-01-01" })).toBe("active");
  });
});
