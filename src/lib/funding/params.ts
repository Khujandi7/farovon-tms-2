import { isAgreementStatus, type AgreementStatus } from "./status";

export const FUNDING_PAGE_SIZE = 25;

export type FundingParams = { status: AgreementStatus | null; q: string; year: number | null; page: number };

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export function parseFundingParams(sp: Record<string, string | string[] | undefined>): FundingParams {
  const status = first(sp.status);
  const year = first(sp.year);
  const page = Number(first(sp.page));
  const q = (first(sp.q) ?? "").trim().slice(0, 100);
  return {
    status: isAgreementStatus(status) ? status : null,
    q,
    year: year && /^\d{4}$/.test(year) && Number(year) >= 2000 && Number(year) <= 2100 ? Number(year) : null,
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
  };
}

/** Экранирование значения для ilike в фильтрах PostgREST: убираем символы, ломающие or()/like. */
export function safeLike(value: string): string {
  return value.replace(/[%_,()\\*]/g, " ").trim();
}

export function fundingQuery(p: Partial<FundingParams>, extra: Record<string, string | number | null | undefined> = {}): string {
  const q = new URLSearchParams();
  if (p.status) q.set("status", p.status);
  if (p.q) q.set("q", p.q);
  if (p.year) q.set("year", String(p.year));
  if (p.page && p.page > 1) q.set("page", String(p.page));
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}
