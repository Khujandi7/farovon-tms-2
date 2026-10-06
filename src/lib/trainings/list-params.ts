import { TRAINING_STATUSES } from "@/lib/workflows/schemas";

export const PAGE_SIZE = 25;
export const SOURCES = ["PLANNED", "UNPLANNED"] as const;

export type ListParams = { year: number | null; status: (typeof TRAINING_STATUSES)[number] | null; source: (typeof SOURCES)[number] | null; q: string; page: number; archived: boolean };

type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Разбор параметров списка тренингов из URL: всё неизвестное отбрасывается, поиск очищается от спецсимволов фильтра PostgREST. */
export function parseListParams(raw: Raw): ListParams {
  const year = one(raw.year);
  const status = one(raw.status);
  const source = one(raw.source);
  const page = Number(one(raw.page));
  return {
    year: year && /^\d{4}$/.test(year) ? Number(year) : null,
    status: (TRAINING_STATUSES as readonly string[]).includes(status ?? "") ? (status as ListParams["status"]) : null,
    source: (SOURCES as readonly string[]).includes(source ?? "") ? (source as ListParams["source"]) : null,
    q: (one(raw.q) ?? "").replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
    archived: one(raw.archived) === "1",
  };
}

export function listQuery(p: Partial<ListParams>, patch: Partial<ListParams> = {}): string {
  const m = { ...p, ...patch };
  const sp = new URLSearchParams();
  if (m.year) sp.set("year", String(m.year));
  if (m.status) sp.set("status", m.status);
  if (m.source) sp.set("source", m.source);
  if (m.q) sp.set("q", m.q);
  if (m.archived) sp.set("archived", "1");
  if (m.page && m.page > 1) sp.set("page", String(m.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
