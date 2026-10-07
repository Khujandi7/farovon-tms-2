import { EXAM_RESULTS } from "./format";

export const EXAMS_PAGE_SIZE = 30;
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ExamListParams = {
  result: (typeof EXAM_RESULTS)[number] | null;
  q: string;
  skill: number | null;
  year: number | null;
  provider: string | null;
  page: number;
};

/** Разбор и очистка параметров адреса списка экзаменов (поиск не должен ломать фильтр PostgREST). */
export function parseExamListParams(raw: Raw): ExamListParams {
  const result = one(raw.result);
  const skill = one(raw.skill) ?? "";
  const year = one(raw.year) ?? "";
  const provider = one(raw.provider) ?? "";
  return {
    result: (EXAM_RESULTS as readonly string[]).includes(result ?? "") ? (result as ExamListParams["result"]) : null,
    q: (one(raw.q) ?? "").replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
    skill: /^\d{1,5}$/.test(skill) ? Number(skill) : null,
    year: /^\d{4}$/.test(year) && Number(year) >= 2000 && Number(year) <= 2100 ? Number(year) : null,
    provider: UUID.test(provider) ? provider : null,
    page: Math.min(Math.max(Number(one(raw.page)) || 1, 1), 10000),
  };
}

export function examListQuery(p: ExamListParams, page: number): string {
  const sp = new URLSearchParams();
  if (p.result) sp.set("result", p.result);
  if (p.q) sp.set("q", p.q);
  if (p.skill) sp.set("skill", String(p.skill));
  if (p.year) sp.set("year", String(p.year));
  if (p.provider) sp.set("provider", p.provider);
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
