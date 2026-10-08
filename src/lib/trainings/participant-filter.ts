/**
 * Отбор сотрудников для участия: поиск по ФИО/табельному номеру и фильтры по департаменту и отделу.
 * Чистые функции (без БД): выбор хранится в форме, а сохраняет участников база (create_training_with_participants).
 */
export type PickEmployee = { id: string; full_name: string; employee_code: string | null; position: string | null; department_id: number | null; unit_id: number | null };
export type PickUnit = { id: number; name: string; level: "DEPARTMENT" | "UNIT"; parent_id: number | null };
export type PickFilter = { q: string; departmentId: number | null; unitId: number | null };

export const normSearch = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Департамент сотрудника: его department_id, а если указан только отдел — родитель отдела. */
export function departmentOf(e: PickEmployee, units: Map<number, PickUnit>): number | null {
  if (e.department_id !== null) return e.department_id;
  return e.unit_id !== null ? (units.get(e.unit_id)?.parent_id ?? null) : null;
}

export function filterEmployees(list: PickEmployee[], units: PickUnit[], f: PickFilter): PickEmployee[] {
  const byId = new Map(units.map((u) => [u.id, u]));
  const words = normSearch(f.q).split(" ").filter(Boolean);
  return list.filter((e) => {
    if (f.departmentId !== null && departmentOf(e, byId) !== f.departmentId) return false;
    if (f.unitId !== null && e.unit_id !== f.unitId) return false;
    if (!words.length) return true;
    const hay = normSearch(`${e.full_name} ${e.employee_code ?? ""}`);
    return words.every((w) => hay.includes(w));
  });
}

/** Подпись «Департамент — Отдел» для строки списка. */
export function orgLabel(e: PickEmployee, units: Map<number, PickUnit>): string {
  const d = departmentOf(e, units);
  return [d !== null ? units.get(d)?.name : null, e.unit_id !== null ? units.get(e.unit_id)?.name : null].filter(Boolean).join(" — ");
}

/** Добавить к выбору (без повторов) / убрать. Возвращает новый массив id в порядке выбора. */
export function addToSelection(selected: string[], ids: string[]): string[] {
  const set = new Set(selected);
  return [...selected, ...ids.filter((id) => !set.has(id) && (set.add(id), true))];
}
export const removeFromSelection = (selected: string[], ids: string[]) => {
  const drop = new Set(ids);
  return selected.filter((id) => !drop.has(id));
};
