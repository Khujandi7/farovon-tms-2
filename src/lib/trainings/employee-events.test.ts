import { describe, expect, it } from "vitest";
import { filterByType, sortEvents, toEventRow, typeOptions } from "./employee-events";

const raw = (id: string, start: string, type: { code: string; name: string } | null, extra: Record<string, unknown> = {}) => ({
  id: `p-${id}`,
  result: null,
  attended: true,
  training: { id: `t-${id}`, canonical_id: `TR-${id}`, title: `Событие ${id}`, start_date: start, end_date: null, hours: "8", status: "COMPLETED", organizer: null, archived_at: null, event_type: type, provider: null, ...extra },
});

describe("мероприятия сотрудника", () => {
  const rows = [
    toEventRow(raw("1", "2026-01-10", { code: "SEMINAR", name: "Семинар" })),
    toEventRow(raw("2", "2026-03-10", { code: "FORUM", name: "Форум" })),
    toEventRow(raw("3", "2026-02-10", { code: "SEMINAR", name: "Семинар" })),
    toEventRow(raw("4", "2026-04-01", { code: "INDIVIDUAL_EDUCATION", name: "Индивидуальное обучение" }, { provider: { name: "Центр" }, hours: 16 })),
  ].filter((x) => x !== null);

  it("разбирает вложенную запись", () => {
    expect(rows).toHaveLength(4);
    expect(rows[3]).toMatchObject({ typeCode: "INDIVIDUAL_EDUCATION", provider: "Центр", hours: 16 });
    expect(rows[0]?.hours).toBe(8);
  });
  it("мусор отбрасывается, отсутствие типа — «Обучение»", () => {
    expect(toEventRow(null)).toBeNull();
    expect(toEventRow({ id: "x" })).toBeNull();
    expect(toEventRow(raw("9", "2026-01-01", null))?.typeCode).toBe("TRAINING");
  });
  it("сортирует по дате по убыванию", () => {
    expect(sortEvents(rows).map((r) => r.code)).toEqual(["TR-4", "TR-2", "TR-3", "TR-1"]);
  });
  it("варианты фильтра и сам фильтр", () => {
    expect(typeOptions(rows)).toEqual([
      { code: "INDIVIDUAL_EDUCATION", name: "Индивидуальное обучение", count: 1 },
      { code: "SEMINAR", name: "Семинар", count: 2 },
      { code: "FORUM", name: "Форум", count: 1 },
    ]);
    expect(filterByType(rows, "SEMINAR")).toHaveLength(2);
    expect(filterByType(rows, "")).toHaveLength(4);
  });
});
