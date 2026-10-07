/** Разбор параметров списка сотрудников из URL. Всё неизвестное отбрасывается; поиск очищается от спецсимволов фильтра PostgREST. */
export const EMPLOYEE_PAGE_SIZE = 30;
export const EMPLOYEE_SORTS = ["name", "code", "position", "status"] as const;
export type EmployeeSort = (typeof EMPLOYEE_SORTS)[number];
export const EMPLOYEE_STATUSES = ["active", "inactive", "all"] as const;
export type EmployeeStatusFilter = (typeof EMPLOYEE_STATUSES)[number];

export type EmployeeListParams = {
  q: string;
  dept: number | null;
  unit: number | null;
  status: EmployeeStatusFilter;
  remarks: boolean;
  sort: EmployeeSort;
  dir: "asc" | "desc";
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const id = (v: string | undefined) => (v && /^\d{1,12}$/.test(v) && Number(v) > 0 ? Number(v) : null);

export function sanitizeSearch(v: string | undefined): string {
  return (v ?? "").replace(/[%_,()*\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export function parseEmployeeListParams(raw: Raw): EmployeeListParams {
  const status = one(raw.status);
  const sort = one(raw.sort);
  const page = Number(one(raw.page));
  return {
    q: sanitizeSearch(one(raw.q)),
    dept: id(one(raw.dept)),
    unit: id(one(raw.unit)),
    // inactive=1 — старая ссылка на список неактивных
    status: (EMPLOYEE_STATUSES as readonly string[]).includes(status ?? "") ? (status as EmployeeStatusFilter) : one(raw.inactive) === "1" ? "inactive" : "active",
    remarks: one(raw.remarks) === "1",
    sort: (EMPLOYEE_SORTS as readonly string[]).includes(sort ?? "") ? (sort as EmployeeSort) : "name",
    dir: one(raw.dir) === "desc" ? "desc" : "asc",
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
  };
}

export const SORT_COLUMN: Record<EmployeeSort, string> = { name: "full_name", code: "employee_code", position: "position", status: "is_active" };

/** Строка запроса для ссылок (пагинация, сортировка). Значения по умолчанию в URL не пишутся. */
export function employeeListQuery(p: EmployeeListParams, patch: Partial<EmployeeListParams> = {}): string {
  const m = { ...p, ...patch };
  const sp = new URLSearchParams();
  if (m.q) sp.set("q", m.q);
  if (m.dept) sp.set("dept", String(m.dept));
  if (m.unit) sp.set("unit", String(m.unit));
  if (m.status !== "active") sp.set("status", m.status);
  if (m.remarks) sp.set("remarks", "1");
  if (m.sort !== "name") sp.set("sort", m.sort);
  if (m.dir === "desc") sp.set("dir", "desc");
  if (m.page > 1) sp.set("page", String(m.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** Параметры фильтров (без сортировки/страницы) в виде объекта для выгрузки. */
export function employeeExportParams(p: EmployeeListParams): Record<string, string> {
  const o: Record<string, string> = {};
  if (p.q) o.q = p.q;
  if (p.dept) o.dept = String(p.dept);
  if (p.unit) o.unit = String(p.unit);
  if (p.status !== "active") o.status = p.status;
  if (p.remarks) o.remarks = "1";
  o.sort = p.sort;
  o.dir = p.dir;
  return o;
}
