/** Мероприятия сотрудника для вкладок досье: разбор строки участия и фильтр по типу (чистая логика). */
export type EmployeeEventRow = {
  participantId: string;
  trainingId: string;
  code: string;
  title: string;
  startDate: string;
  endDate: string | null;
  hours: number | null;
  status: string;
  typeCode: string;
  typeName: string;
  provider: string | null;
  organizer: string | null;
  result: string | null;
  attended: boolean;
  archived: boolean;
};

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Запись training_participants с вложенным trainings → строка. Некорректные записи отбрасываются (null). */
export function toEventRow(raw: unknown): EmployeeEventRow | null {
  const r = obj(raw);
  const t = obj(r?.training);
  if (!r || !t || typeof r.id !== "string" || typeof t.id !== "string") return null;
  const type = obj(t.event_type);
  const provider = obj(t.provider);
  return {
    participantId: r.id,
    trainingId: t.id,
    code: str(t.canonical_id) ?? "",
    title: str(t.title) ?? "Без названия",
    startDate: str(t.start_date) ?? "",
    endDate: str(t.end_date),
    hours: typeof t.hours === "number" ? t.hours : t.hours != null && !Number.isNaN(Number(t.hours)) ? Number(t.hours) : null,
    status: str(t.status) ?? "",
    typeCode: str(type?.code) ?? "TRAINING",
    typeName: str(type?.name) ?? "Обучение",
    provider: str(provider?.name),
    organizer: str(t.organizer),
    result: str(r.result),
    attended: r.attended !== false,
    archived: t.archived_at != null,
  };
}

export function sortEvents(rows: EmployeeEventRow[]): EmployeeEventRow[] {
  return [...rows].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.code.localeCompare(a.code));
}

export type TypeFilterOption = { code: string; name: string; count: number };

/** Типы, которые реально есть у сотрудника, для выпадающего фильтра. */
export function typeOptions(rows: EmployeeEventRow[]): TypeFilterOption[] {
  const map = new Map<string, TypeFilterOption>();
  for (const r of rows) {
    const cur = map.get(r.typeCode);
    if (cur) cur.count += 1;
    else map.set(r.typeCode, { code: r.typeCode, name: r.typeName, count: 1 });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function filterByType(rows: EmployeeEventRow[], code: string): EmployeeEventRow[] {
  return code ? rows.filter((r) => r.typeCode === code) : rows;
}

export const INDIVIDUAL_TYPE_CODE = "INDIVIDUAL_EDUCATION";
