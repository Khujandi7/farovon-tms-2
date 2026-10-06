import { describe, expect, it } from "vitest";
import { describeAudit, formatAuditValue, isRevertCandidate, type AuditRow } from "./describe";

const base: AuditRow = { id: 1, at: "2026-10-06T10:00:00Z", user_id: "u", user_name: "Менеджер", table_name: "trainings", row_id: "x", action: "UPDATE", reason: "Начали", old_row: null, new_row: null, changes: null };

describe("describeAudit", () => {
  it("статус тренинга: понятные подписи и причина остаётся в записи", () => {
    const v = describeAudit({ ...base, new_row: { title: "Excel" }, changes: { status: ["PLANNED", "IN_PROGRESS"], updated_at: ["a", "b"] } });
    expect(v.title).toBe("Тренинг: изменено");
    expect(v.lines).toEqual([{ field: "status", label: "Статус", before: "Запланировано", after: "Идёт" }]);
  });
  it("служебные поля скрыты", () => {
    const v = describeAudit({ ...base, changes: { updated_by: ["a", "b"], updated_at: ["c", "d"] } });
    expect(v.lines).toHaveLength(0);
  });
  it("посещаемость: имя участника и заход из справочника", () => {
    const v = describeAudit(
      { ...base, table_name: "session_attendance", new_row: { participant_id: "p1", session_id: "s1", status: "ABSENT" }, changes: { status: ["PRESENT", "ABSENT"] } },
      { employees: {}, participants: { p1: "Иванов П." }, sessions: { s1: "Заход 2" }, requests: {}, categories: {} },
    );
    expect(v.subject).toBe("Иванов П. · Заход 2");
    expect(v.lines[0]).toMatchObject({ before: "Присутствовал", after: "Отсутствовал" });
  });
  it("привязка заявки показывает код заявки", () => {
    const v = describeAudit({ ...base, changes: { request_id: [null, "r1"] } }, { employees: {}, participants: {}, sessions: {}, categories: {}, requests: { r1: "REQ-2026-001" } });
    expect(v.lines[0]).toMatchObject({ label: "Заявка", before: "—", after: "REQ-2026-001" });
  });
  it("сторно расхода отмечено в заголовке", () => {
    const v = describeAudit({ ...base, table_name: "expense_operations", new_row: { voided_at: "2026-10-01", amount: 10, currency: "TJS" }, changes: { voided_at: [null, "2026-10-01"], void_reason: [null, "Ошибка"] } });
    expect(v.title).toBe("Сторно расхода");
  });
  it("удаление и добавление", () => {
    expect(describeAudit({ ...base, action: "DELETE", table_name: "training_participants", old_row: { employee_id: "e1", attended: true } }, { employees: { e1: "Иванов" }, participants: {}, sessions: {}, requests: {}, categories: {} }).title).toBe("Участник: удалено");
    expect(describeAudit({ ...base, action: "INSERT", new_row: { title: "T", hours: 8 } }).title).toBe("Тренинг: добавлено");
  });
});

describe("formatAuditValue", () => {
  it("даты, булевы и пустые значения", () => {
    expect(formatAuditValue("trainings", "start_date", "2026-05-01")).toBe("01.05.2026");
    expect(formatAuditValue("trainings", "x", true)).toBe("да");
    expect(formatAuditValue("trainings", "x", null)).toBe("—");
    expect(formatAuditValue("trainings", "x", "")).toBe("—");
  });
});

describe("isRevertCandidate", () => {
  it("откат для тренингов, заходов, участников, посещаемости, заявок; не для расходов", () => {
    expect(isRevertCandidate({ ...base, changes: { status: ["A", "B"] } })).toBe(true);
    expect(isRevertCandidate({ ...base, changes: { updated_at: ["a", "b"] } })).toBe(false);
    expect(isRevertCandidate({ ...base, table_name: "expense_operations", changes: { amount: [1, 2] } })).toBe(false);
    expect(isRevertCandidate({ ...base, table_name: "training_participants", action: "DELETE" })).toBe(true);
    expect(isRevertCandidate({ ...base, action: "DELETE" })).toBe(false);
  });
});
