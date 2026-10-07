import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { LIFECYCLE_STATUSES, TRANSITIONS, allowedNextStatuses, isAdminOverride, transitionAllowed } from "./lifecycle";

describe("жизненный цикл мероприятия", () => {
  it("переход в тот же статус допустим", () => {
    for (const s of LIFECYCLE_STATUSES) expect(transitionAllowed(s, s)).toBe(true);
  });
  it("проведённое можно только вернуть в «Идёт»", () => {
    expect(allowedNextStatuses("COMPLETED", false)).toEqual(["IN_PROGRESS"]);
    expect(transitionAllowed("COMPLETED", "PLANNED")).toBe(false);
  });
  it("черновик: только в план или отмену", () => {
    expect(allowedNextStatuses("DRAFT", false)).toEqual(["PLANNED", "CANCELLED"]);
    expect(transitionAllowed("DRAFT", "COMPLETED")).toBe(false);
  });
  it("ADMIN видит все статусы, кроме текущего", () => {
    const all = allowedNextStatuses("COMPLETED", true);
    expect(all).toHaveLength(LIFECYCLE_STATUSES.length - 1);
    expect(all).not.toContain("COMPLETED");
  });
  it("исправление админа определяется как выход за таблицу", () => {
    expect(isAdminOverride("COMPLETED", "PLANNED")).toBe(true);
    expect(isAdminOverride("PLANNED", "APPROVED")).toBe(false);
    expect(isAdminOverride("PLANNED", "PLANNED")).toBe(false);
  });
  it("неизвестные статусы не допускаются", () => {
    expect(transitionAllowed("X", "PLANNED")).toBe(false);
    expect(allowedNextStatuses("X", false)).toEqual([]);
  });
  it("таблица совпадает с SQL training_transition_allowed", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../../supabase/migrations/20261007100000_phase3a1_01_learning_events.sql"), "utf8");
    const body = sql.slice(sql.indexOf("create function training_transition_allowed"));
    const parsed: Record<string, string[]> = {};
    for (const m of body.matchAll(/when '([A-Z_]+)' then p_to in \(([^)]*)\)/g)) {
      parsed[m[1]!] = [...m[2]!.matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]!);
    }
    expect(Object.keys(parsed).sort()).toEqual([...LIFECYCLE_STATUSES].sort());
    for (const s of LIFECYCLE_STATUSES) expect([...TRANSITIONS[s]].sort(), s).toEqual([...(parsed[s] ?? [])].sort());
  });
});
