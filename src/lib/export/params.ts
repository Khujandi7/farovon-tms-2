import { parseListParams, type ListParams } from "@/lib/trainings/list-params";
import { parseEmployeeListParams, sanitizeSearch, type EmployeeListParams } from "@/lib/employees/list-params";
import { isExportEntity, type ExportEntity } from "./columns";

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (v: string | undefined) => (v && UUID.test(v) ? v : null);
const year = (v: string | undefined) => (v && /^\d{4}$/.test(v) ? Number(v) : null);

export const EXAM_RESULTS = ["PENDING", "PASSED", "FAILED", "NOT_ATTENDED", "OTHER"] as const;
export const CERT_STATUSES = ["ACTIVE", "NO_EXPIRATION", "EXPIRED", "REVOKED"] as const;
export const AGREEMENT_STATUSES_FILTER = ["ACTIVE", "COMPLETED", "OBLIGATION_CREATED", "PARTIALLY_REPAID", "REPAID", "CANCELLED"] as const;

export type ExportRequest =
  | { entity: "employees"; filters: EmployeeListParams }
  | { entity: "trainings"; filters: ListParams }
  | { entity: "exams"; filters: { employeeId: string | null; result: string | null; year: number | null; q: string } }
  | { entity: "certificates"; filters: { employeeId: string | null; status: string | null; q: string } }
  | { entity: "participants"; filters: { trainingId: string | null } }
  | { entity: "agreements"; filters: { employeeId: string | null; status: string | null } };

export type ExportFormat = "csv" | "xlsx";
export function parseFormat(v: string | undefined | null): ExportFormat {
  return v === "xlsx" ? "xlsx" : "csv";
}

/** Разбор параметров выгрузки; неизвестные значения отбрасываются. Возвращает null, если сущность неизвестна. */
export function parseExportRequest(entity: string, raw: Raw): ExportRequest | null {
  if (!isExportEntity(entity)) return null;
  const e: ExportEntity = entity;
  switch (e) {
    case "employees":
      return { entity: e, filters: parseEmployeeListParams(raw) };
    case "trainings":
      return { entity: e, filters: parseListParams(raw) };
    case "exams": {
      const result = one(raw.result);
      return { entity: e, filters: { employeeId: uuidOrNull(one(raw.employee_id)), result: (EXAM_RESULTS as readonly string[]).includes(result ?? "") ? (result as string) : null, year: year(one(raw.year)), q: sanitizeSearch(one(raw.q)) } };
    }
    case "certificates": {
      const status = one(raw.status);
      return { entity: e, filters: { employeeId: uuidOrNull(one(raw.employee_id)), status: (CERT_STATUSES as readonly string[]).includes(status ?? "") ? (status as string) : null, q: sanitizeSearch(one(raw.q)) } };
    }
    case "participants":
      return { entity: e, filters: { trainingId: uuidOrNull(one(raw.training_id)) } };
    case "agreements": {
      const status = one(raw.status);
      return { entity: e, filters: { employeeId: uuidOrNull(one(raw.employee_id)), status: (AGREEMENT_STATUSES_FILTER as readonly string[]).includes(status ?? "") ? (status as string) : null } };
    }
  }
}
