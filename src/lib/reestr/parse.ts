/**
 * Лист Google «Реестр обучения сотрудников» → данные для функции БД reestr_sync.
 * Чистые функции (без сети): заголовки ищутся по названию колонки, а не по номеру, пустые и мусорные строки пропускаются.
 */
export const REESTR_TABS = { trainings: "Таблица Тренингов 2025", participants: "Участники тренингов", expenses: "Расходы" } as const;
export const REESTR_DEFAULT_SHEET_ID = "1rr8TYQlVmVr4feUxYZ6V2WAdUcph6_TKCQc8tYcgvdM";

export type ReestrTraining = {
  id: number;
  title: string;
  format: "ONLINE" | "OFFLINE" | "BLENDED";
  kind: "INTERNAL" | "EXTERNAL" | "UNSPECIFIED";
  location: string;
  trainer: string;
  hours: number | null;
  start: string | null;
  end: string | null;
  status: "COMPLETED" | "IN_PROGRESS" | "CANCELLED" | "POSTPONED" | "NOT_HELD" | "PLANNED" | null;
  source: "PLANNED" | "UNPLANNED";
  total: number | null;
};
export type ReestrParticipant = { tid: number; name: string; dept: string };
export type ReestrExpense = { tid: number; rent: number; coffee: number; lunch: number; fee: number; other: number; total: number };
export type ReestrPayload = { trainings: ReestrTraining[]; participants: ReestrParticipant[]; expenses: ReestrExpense[] };

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export function parseNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/[\s ]/g, "").replace(",", ".");
  if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** dd.mm.yyyy или yyyy-mm-dd → ISO-дата; несуществующая дата → null. */
export function parseDate(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let y: number, m: number, d: number;
  let mm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (mm) {
    d = Number(mm[1]);
    m = Number(mm[2]);
    y = Number(mm[3]);
  } else {
    mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!mm) return null;
    y = Number(mm[1]);
    m = Number(mm[2]);
    d = Number(mm[3]);
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function indexer(matrix: string[][]) {
  const header = (matrix[0] ?? []).map(norm);
  return (...names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(norm(n));
      if (i >= 0) return i;
    }
    return -1;
  };
}
const cell = (row: string[], i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");
const intId = (s: string) => (/^\d{1,6}$/.test(s) ? Number(s) : null);

function mapFormat(s: string): ReestrTraining["format"] {
  const n = norm(s);
  if (n.startsWith("онлайн")) return "ONLINE";
  if (n.startsWith("смеш")) return "BLENDED";
  return "OFFLINE";
}
function mapKind(s: string): ReestrTraining["kind"] {
  const n = norm(s);
  if (n.startsWith("внутр")) return "INTERNAL";
  if (n.startsWith("внешн")) return "EXTERNAL";
  return "UNSPECIFIED";
}
function mapStatus(s: string): ReestrTraining["status"] {
  const n = norm(s).replace(/\s/g, "");
  if (n.startsWith("выполнен")) return "COMPLETED";
  if (n.startsWith("впроцесс")) return "IN_PROGRESS";
  if (n.startsWith("отмен")) return "CANCELLED";
  if (n.startsWith("перенес")) return "POSTPONED";
  if (n.startsWith("несостоял")) return "NOT_HELD";
  if (n.startsWith("план") || n.startsWith("запланир")) return "PLANNED";
  return null;
}

export function parseTrainings(matrix: string[][]): ReestrTraining[] {
  const col = indexer(matrix);
  const c = {
    id: col("ID_тренинг"), title: col("Тема"), format: col("Формат"), kind: col("Вид обучение"), loc: col("Место проведения"),
    trainer: col("Тренер"), hours: col("Прод.час"), start: col("Дата начало"), end: col("Дата окончание"), total: col("Расходы в сомони"),
    status: col("Статус"), source: col("Статус1"),
  };
  const out: ReestrTraining[] = [];
  const seen = new Set<number>();
  for (const row of matrix.slice(1)) {
    const id = intId(cell(row, c.id));
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    const hours = parseNumber(cell(row, c.hours));
    out.push({
      id,
      title: cell(row, c.title).replace(/\s+/g, " "),
      format: mapFormat(cell(row, c.format)),
      kind: mapKind(cell(row, c.kind)),
      location: cell(row, c.loc),
      trainer: cell(row, c.trainer),
      hours: hours !== null && hours > 0 && hours <= 5000 ? hours : null,
      start: parseDate(cell(row, c.start)),
      end: parseDate(cell(row, c.end)),
      status: mapStatus(cell(row, c.status)),
      source: norm(cell(row, c.source)).startsWith("внеплан") ? "UNPLANNED" : "PLANNED",
      total: parseNumber(cell(row, c.total)),
    });
  }
  return out;
}

export function parseParticipants(matrix: string[][]): ReestrParticipant[] {
  const col = indexer(matrix);
  const c = { id: col("ID_тренинг"), name: col("Участник"), dept: col("Департамент") };
  const out: ReestrParticipant[] = [];
  for (const row of matrix.slice(1)) {
    const tid = intId(cell(row, c.id));
    const name = cell(row, c.name).replace(/\s+/g, " ");
    if (tid === null || name === "") continue;
    out.push({ tid, name, dept: cell(row, c.dept) });
  }
  return out;
}

export function parseExpenses(matrix: string[][]): ReestrExpense[] {
  const col = indexer(matrix);
  const c = { id: col("ID_тренинг"), rent: col("Аренда помещения"), coffee: col("Кофебрейк"), lunch: col("Обед"), fee: col("Гонорар тренера"), other: col("Доп.расходы"), total: col("Итого") };
  const n = (row: string[], i: number) => Math.max(parseNumber(cell(row, i)) ?? 0, 0);
  const out: ReestrExpense[] = [];
  for (const row of matrix.slice(1)) {
    const tid = intId(cell(row, c.id));
    if (tid === null) continue;
    out.push({ tid, rent: n(row, c.rent), coffee: n(row, c.coffee), lunch: n(row, c.lunch), fee: n(row, c.fee), other: n(row, c.other), total: n(row, c.total) });
  }
  return out;
}

/** Если у тренинга нет разбивки на листе «Расходы», но есть итог в основной таблице — передаём его как общую сумму. */
export function buildPayload(tr: string[][], pa: string[][], ex: string[][]): ReestrPayload {
  const trainings = parseTrainings(tr);
  const all = parseExpenses(ex);
  const sum = (e: ReestrExpense) => e.rent + e.coffee + e.lunch + e.fee + e.other + e.total;
  const expenses = all.filter((e) => sum(e) > 0);
  const have = new Set(expenses.map((e) => e.tid));
  for (const t of trainings) if (!have.has(t.id) && t.total && t.total > 0) expenses.push({ tid: t.id, rent: 0, coffee: 0, lunch: 0, fee: 0, other: 0, total: t.total });
  return { trainings, participants: parseParticipants(pa), expenses };
}
