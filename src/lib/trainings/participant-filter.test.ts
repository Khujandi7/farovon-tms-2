import { describe, expect, it } from "vitest";
import { addToSelection, filterEmployees, orgLabel, removeFromSelection, type PickEmployee, type PickUnit } from "./participant-filter";

const units: PickUnit[] = [
  { id: 1, name: "Производство", level: "DEPARTMENT", parent_id: null },
  { id: 2, name: "Цех 1", level: "UNIT", parent_id: 1 },
  { id: 3, name: "Финансы", level: "DEPARTMENT", parent_id: null },
];
const emp = (id: string, full_name: string, code: string | null, d: number | null, u: number | null): PickEmployee => ({ id, full_name, employee_code: code, position: null, department_id: d, unit_id: u });
const list = [emp("a", "Алиев Рустам", "T-1", 1, 2), emp("b", "Бобоев Сухроб", "T-2", 1, null), emp("c", "Фёдоров Пётр", "T-3", 3, null), emp("d", "Алиева Зарина", "00123", null, 2)];

describe("отбор участников", () => {
  it("поиск по фамилии, имени и табельному номеру, без учёта регистра и ё", () => {
    expect(filterEmployees(list, units, { q: "алиев", departmentId: null, unitId: null }).map((e) => e.id)).toEqual(["a", "d"]);
    expect(filterEmployees(list, units, { q: "федоров петр", departmentId: null, unitId: null }).map((e) => e.id)).toEqual(["c"]);
    expect(filterEmployees(list, units, { q: "00123", departmentId: null, unitId: null }).map((e) => e.id)).toEqual(["d"]);
  });
  it("фильтр по департаменту учитывает сотрудников, у которых указан только отдел", () => {
    expect(filterEmployees(list, units, { q: "", departmentId: 1, unitId: null }).map((e) => e.id)).toEqual(["a", "b", "d"]);
    expect(filterEmployees(list, units, { q: "", departmentId: 1, unitId: 2 }).map((e) => e.id)).toEqual(["a", "d"]);
    expect(filterEmployees(list, units, { q: "бобоев", departmentId: 3, unitId: null })).toEqual([]);
  });
  it("подпись «Департамент — Отдел»", () => {
    const m = new Map(units.map((u) => [u.id, u]));
    expect(orgLabel(list[0]!, m)).toBe("Производство — Цех 1");
    expect(orgLabel(list[3]!, m)).toBe("Производство — Цех 1");
    expect(orgLabel(list[2]!, m)).toBe("Финансы");
  });
  it("массовый выбор без повторов и снятие отдельных сотрудников", () => {
    let sel = addToSelection([], ["a", "b"]);
    sel = addToSelection(sel, ["b", "d", "d"]);
    expect(sel).toEqual(["a", "b", "d"]);
    expect(removeFromSelection(sel, ["b"])).toEqual(["a", "d"]);
  });
});
