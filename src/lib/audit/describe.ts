import { formatDate } from "@/lib/format";
import {
  ATTENDANCE_LABELS,
  AUDIT_TABLE_LABELS,
  FIELD_LABELS,
  REQUEST_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
  TRAINING_FORMAT_LABELS,
  TRAINING_KIND_LABELS,
  TRAINING_STATUS_LABELS,
  UNPLANNED_REASON_LABELS,
} from "@/lib/labels";

export type AuditRow = {
  id: number;
  at: string;
  user_id: string | null;
  user_name: string | null;
  table_name: string;
  row_id: string | null;
  action: string;
  reason: string | null;
  old_row: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
  changes: Record<string, unknown> | null;
};

/** Справочники для расшифровки идентификаторов (сотрудники, заходы, заявки, статьи расходов). */
export type AuditLookup = {
  employees: Record<string, string>;
  participants: Record<string, string>;
  sessions: Record<string, string>;
  requests: Record<string, string>;
  categories: Record<string, string>;
};

export const EMPTY_LOOKUP: AuditLookup = { employees: {}, participants: {}, sessions: {}, requests: {}, categories: {} };

/** Поля, которые не показываем человеку: служебные или дублирующие. */
const HIDDEN = new Set(["id", "created_at", "updated_at", "created_by", "updated_by", "marked_at", "marked_by", "added_at", "added_by", "training_id", "participant_id", "fx_date", "name_norm", "canonical_id"]);

const ENUM_MAPS: Record<string, Record<string, string>> = {
  format: TRAINING_FORMAT_LABELS,
  kind: TRAINING_KIND_LABELS,
  source_type: SOURCE_TYPE_LABELS,
  unplanned_reason: UNPLANNED_REASON_LABELS,
};

export function formatAuditValue(table: string, field: string, value: unknown, lookup: AuditLookup = EMPTY_LOOKUP): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "да" : "нет";
  const s = String(value);
  if (field === "status") {
    if (table === "session_attendance") return ATTENDANCE_LABELS[s as keyof typeof ATTENDANCE_LABELS] ?? s;
    if (table === "training_requests") return REQUEST_STATUS_LABELS[s as keyof typeof REQUEST_STATUS_LABELS] ?? s;
    return TRAINING_STATUS_LABELS[s as keyof typeof TRAINING_STATUS_LABELS] ?? s;
  }
  if (ENUM_MAPS[field]) return ENUM_MAPS[field][s] ?? s;
  if (field === "employee_id") return lookup.employees[s] ?? "сотрудник";
  if (field === "session_id") return lookup.sessions[s] ?? "заход";
  if (field === "request_id") return lookup.requests[s] ?? "заявка";
  if (field === "category_id") return lookup.categories[s] ?? `статья ${s}`;
  if (/_date$/.test(field) || field === "request_date") return formatDate(s);
  if (/_at$/.test(field)) return formatDate(s.slice(0, 10));
  return s;
}

export type ChangeLine = { field: string; label: string; before: string; after: string };

export type AuditView = { title: string; subject: string; lines: ChangeLine[] };

function subjectOf(row: AuditRow, lookup: AuditLookup): string {
  const r = row.new_row ?? row.old_row ?? {};
  switch (row.table_name) {
    case "training_participants":
      return lookup.employees[String(r.employee_id)] ?? "участник";
    case "session_attendance":
      return `${lookup.participants[String(r.participant_id)] ?? "участник"} · ${lookup.sessions[String(r.session_id)] ?? "заход"}`;
    case "training_sessions":
      return `Заход ${r.session_no ?? ""}`.trim();
    case "expense_operations":
      return `${lookup.categories[String(r.category_id)] ?? "Расход"}: ${r.amount ?? ""} ${r.currency ?? ""}`.trim();
    case "trainings":
      return String(r.title ?? "Тренинг");
    case "training_requests":
      return String(r.canonical_id ?? r.topic ?? "Заявка");
    case "employee_aliases":
      return String(r.alias_norm ?? "написание");
    default:
      return AUDIT_TABLE_LABELS[row.table_name] ?? row.table_name;
  }
}

/** Человекочитаемое описание записи аудита: что изменено, поле, было → стало. */
export function describeAudit(row: AuditRow, lookup: AuditLookup = EMPTY_LOOKUP): AuditView {
  const noun = AUDIT_TABLE_LABELS[row.table_name] ?? row.table_name;
  const subject = subjectOf(row, lookup);
  const lines: ChangeLine[] = [];
  const pushLine = (field: string, before: unknown, after: unknown) => {
    if (HIDDEN.has(field)) return;
    lines.push({ field, label: FIELD_LABELS[field] ?? field, before: formatAuditValue(row.table_name, field, before, lookup), after: formatAuditValue(row.table_name, field, after, lookup) });
  };

  if (row.action === "UPDATE") {
    const changes = (row.changes ?? {}) as Record<string, [unknown, unknown]>;
    for (const [field, pair] of Object.entries(changes)) if (Array.isArray(pair)) pushLine(field, pair[0], pair[1]);
    const voided = row.table_name === "expense_operations" && row.new_row?.voided_at;
    return { title: voided ? "Сторно расхода" : `${noun}: изменено`, subject, lines };
  }
  if (row.action === "INSERT") {
    for (const [k, v] of Object.entries(row.new_row ?? {})) if (v !== null && v !== "") pushLine(k, null, v);
    return { title: `${noun}: добавлено`, subject, lines: lines.slice(0, 8) };
  }
  for (const [k, v] of Object.entries(row.old_row ?? {})) if (v !== null && v !== "") pushLine(k, v, null);
  return { title: `${noun}: удалено`, subject, lines: lines.slice(0, 8) };
}

/** Можно ли предлагать откат ↶ для записи (сама таблица, не повтор отката и есть что откатывать). */
export function isRevertCandidate(row: AuditRow): boolean {
  if (!["trainings", "training_sessions", "training_participants", "session_attendance", "training_requests"].includes(row.table_name)) return false;
  if (row.action === "UPDATE") {
    const keys = Object.keys(row.changes ?? {}).filter((k) => !HIDDEN.has(k));
    return keys.length > 0;
  }
  if (row.table_name === "trainings" || row.table_name === "training_requests") return row.action === "INSERT";
  return true;
}
