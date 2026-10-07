import { describe, expect, it } from "vitest";
import { describeFundingAudit } from "./audit";

describe("describeFundingAudit", () => {
  it("показывает изменение статуса по-русски и скрывает служебные поля", () => {
    const v = describeFundingAudit({
      id: 1, at: "2026-01-01T00:00:00Z", user_name: "A", table_name: "learning_agreements", action: "UPDATE", reason: "r", old_row: null, new_row: null,
      changes: { status: ["ACTIVE", "OBLIGATION_CREATED"], updated_by: ["a", "b"], repayment_amount: [0, 500] },
    });
    expect(v.title).toBe("Соглашение: изменено");
    expect(v.lines.map((l) => l.field)).toEqual(["status", "repayment_amount"]);
    expect(v.lines[0]).toMatchObject({ before: "Действует", after: "Обязательство создано" });
  });
});
