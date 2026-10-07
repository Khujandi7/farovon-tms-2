import { describe, expect, it } from "vitest";
import { canSubmitMatches, initialDecisions, parseMatchResult, parseNameLines, selectedEmployeeIds, summarize, type MatchRow } from "./name-list";

describe("parseNameLines", () => {
  it("убирает пустые строки, нумерацию и лишние пробелы", () => {
    const r = parseNameLines("1. Иванов  Иван\r\n\r\n2) Петров Пётр\n   \nСидоров Сидор");
    expect(r.names).toEqual(["Иванов Иван", "Петров Пётр", "Сидоров Сидор"]);
  });
  it("берёт первый непустой столбец из Excel", () => {
    expect(parseNameLines("\tИванов Иван\tИнженер\nПетров Пётр\tбухгалтер").names).toEqual(["Иванов Иван", "Петров Пётр"]);
  });
  it("считает повторы без учёта регистра и ё/е", () => {
    const r = parseNameLines("Фёдоров Фёдор\nфедоров федор\nИванов Иван");
    expect(r.names).toHaveLength(2);
    expect(r.duplicates).toBe(1);
  });
  it("ограничивает 3000 строк", () => {
    const text = Array.from({ length: 3005 }, (_, i) => `Сотрудник ${i}`).join("\n");
    const r = parseNameLines(text);
    expect(r.names).toHaveLength(3000);
    expect(r.tooMany).toBe(true);
  });
});

const cand = (id: string, name = id) => ({ employee_id: id, full_name: name, match_kind: "EXACT", department_id: null, unit_id: null, position: null });
const rows: MatchRow[] = [
  { index: 1, input: "A", status: "FOUND", candidates: [cand("e1")] },
  { index: 2, input: "B", status: "AMBIGUOUS", candidates: [cand("e2"), cand("e3")] },
  { index: 3, input: "C", status: "NOT_FOUND", candidates: [] },
];

describe("сопоставление", () => {
  it("автоматически выбираются только однозначные", () => {
    expect(initialDecisions(rows)).toEqual({ 1: "e1" });
  });
  it("нерешённые строки блокируют добавление", () => {
    const d = initialDecisions(rows);
    expect(canSubmitMatches(rows, d)).toBe(false);
    expect(summarize(rows, d)).toMatchObject({ found: 1, ambiguous: 1, notFound: 1, selected: 1, pending: 2 });
  });
  it("после выбора кандидата и пропуска можно добавлять; создание сотрудников не происходит", () => {
    const d = { ...initialDecisions(rows), 2: "e3", 3: "skip" } as const;
    expect(canSubmitMatches(rows, d)).toBe(true);
    expect(selectedEmployeeIds(rows, d)).toEqual(["e1", "e3"]);
  });
  it("только пропуски: добавлять некого", () => {
    expect(canSubmitMatches(rows, { 1: "skip", 2: "skip", 3: "skip" })).toBe(false);
  });
  it("один сотрудник из двух строк учитывается как дубль выбора", () => {
    const d = { 1: "e1", 2: "e1", 3: "skip" } as const;
    expect(selectedEmployeeIds(rows, d)).toEqual(["e1"]);
    expect(summarize(rows, d).duplicatePicks).toBe(1);
  });
  it("parseMatchResult устойчив к мусору", () => {
    expect(parseMatchResult(null)).toEqual([]);
    expect(parseMatchResult([{ status: "WAT" }, 5, { index: 4, input: "X", status: "NOT_FOUND" }])).toEqual([{ index: 4, input: "X", status: "NOT_FOUND", candidates: [] }]);
    expect(parseMatchResult([{ index: 1, input: "A", status: "FOUND", candidates: [{ employee_id: "e1", full_name: "A", match_kind: "EXACT", unit_id: 3 }, { nope: 1 }] }])[0]?.candidates).toHaveLength(1);
  });
});
