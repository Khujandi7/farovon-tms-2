/**
 * Вставка списка ФИО для добавления участников: разбор строк и состояние сопоставления.
 * Ничего не создаёт: неоднозначные и ненайденные строки остаются нерешёнными, пока пользователь
 * не выберет кандидата или не пропустит строку. Создание сотрудника — отдельное явное действие.
 */
export const MAX_NAME_LINES = 3000;

export type ParsedNames = { names: string[]; duplicates: number; tooMany: boolean };

export function parseNameLines(text: string): ParsedNames {
  const seen = new Set<string>();
  const names: string[] = [];
  let duplicates = 0;
  for (const raw of text.split(/\r?\n/)) {
    // «1. Иванов Иван», «2) Петров Пётр», столбцы Excel через табуляцию: берём первый непустой столбец
    const cell = raw.split("\t").map((c) => c.trim()).find((c) => c.length > 0) ?? "";
    const line = cell.replace(/^\s*\d{1,4}\s*[.)]\s+/, "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const key = line.toLowerCase().replace(/ё/g, "е");
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    names.push(line);
  }
  return { names: names.slice(0, MAX_NAME_LINES), duplicates, tooMany: names.length > MAX_NAME_LINES };
}

export type MatchCandidate = { employee_id: string; full_name: string; match_kind: string; department_id: number | null; unit_id: number | null; position: string | null };
export type MatchStatus = "FOUND" | "AMBIGUOUS" | "NOT_FOUND";
export type MatchRow = { index: number; input: string; status: MatchStatus; candidates: MatchCandidate[] };

/** Защитный разбор ответа match_names (jsonb): неверная форма даёт пустой список, а не падение. */
export function parseMatchResult(raw: unknown): MatchRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: MatchRow[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const status = o.status === "FOUND" || o.status === "AMBIGUOUS" || o.status === "NOT_FOUND" ? o.status : null;
    if (!status) continue;
    const candidates = Array.isArray(o.candidates)
      ? (o.candidates as Record<string, unknown>[])
          .filter((c) => c && typeof c.employee_id === "string")
          .map((c) => ({
            employee_id: String(c.employee_id),
            full_name: String(c.full_name ?? ""),
            match_kind: String(c.match_kind ?? ""),
            department_id: typeof c.department_id === "number" ? c.department_id : null,
            unit_id: typeof c.unit_id === "number" ? c.unit_id : null,
            position: typeof c.position === "string" ? c.position : null,
          }))
      : [];
    rows.push({ index: Number(o.index) || rows.length + 1, input: String(o.input ?? ""), status, candidates });
  }
  return rows;
}

/** Решение по строке: id выбранного сотрудника, "skip" или отсутствие решения. */
export type Decisions = Record<number, string | "skip" | undefined>;

/** Однозначные совпадения выбираются сами; остальное ждёт решения. */
export function initialDecisions(rows: MatchRow[]): Decisions {
  const d: Decisions = {};
  for (const r of rows) if (r.status === "FOUND" && r.candidates[0]) d[r.index] = r.candidates[0].employee_id;
  return d;
}

export function selectedEmployeeIds(rows: MatchRow[], decisions: Decisions): string[] {
  const ids = new Set<string>();
  for (const r of rows) {
    const d = decisions[r.index];
    if (d && d !== "skip") ids.add(d);
  }
  return [...ids];
}

export type MatchSummary = { total: number; found: number; ambiguous: number; notFound: number; selected: number; skipped: number; pending: number; duplicatePicks: number };

export function summarize(rows: MatchRow[], decisions: Decisions): MatchSummary {
  let selected = 0;
  let skipped = 0;
  let pending = 0;
  for (const r of rows) {
    const d = decisions[r.index];
    if (d === "skip") skipped += 1;
    else if (d) selected += 1;
    else pending += 1;
  }
  return {
    total: rows.length,
    found: rows.filter((r) => r.status === "FOUND").length,
    ambiguous: rows.filter((r) => r.status === "AMBIGUOUS").length,
    notFound: rows.filter((r) => r.status === "NOT_FOUND").length,
    selected,
    skipped,
    pending,
    duplicatePicks: selected - selectedEmployeeIds(rows, decisions).length,
  };
}

/** Можно добавлять только когда по каждой строке принято решение (выбрать или пропустить) и есть кого добавлять. */
export function canSubmitMatches(rows: MatchRow[], decisions: Decisions): boolean {
  const s = summarize(rows, decisions);
  return s.pending === 0 && selectedEmployeeIds(rows, decisions).length > 0;
}

export const MATCH_KIND_LABELS: Record<string, string> = {
  CODE: "по табельному номеру",
  EXACT: "точное совпадение",
  ALIAS: "по сохранённому написанию",
  REORDERED: "другой порядок слов",
  PARTIAL: "неполное ФИО",
};
