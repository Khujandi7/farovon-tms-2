export type SearchRow = { kind: string; id: string; title: string; subtitle: string; href: string };

export const SEARCH_KIND_LABELS: Record<string, string> = {
  EMPLOYEE: "Сотрудники",
  TRAINING: "Обучения",
  REQUEST: "Заявки",
  EXAM: "Экзамены",
  CERTIFICATE: "Сертификаты",
  CONTRACT: "Договоры",
  TRAINER: "Тренеры",
  DOCUMENT: "Документы",
};
const ORDER = ["EMPLOYEE", "TRAINING", "REQUEST", "EXAM", "CERTIFICATE", "CONTRACT", "TRAINER", "DOCUMENT"];

export type SearchGroup = { kind: string; label: string; rows: SearchRow[] };

/** Группировка по kind в фиксированном порядке; дубликаты (kind + id) убираются, внутренние ссылки только. */
export function groupSearchRows(rows: SearchRow[]): SearchGroup[] {
  const seen = new Set<string>();
  const byKind = new Map<string, SearchRow[]>();
  for (const r of rows) {
    if (!r.href.startsWith("/") || r.href.startsWith("//")) continue;
    const key = `${r.kind}|${r.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const list = byKind.get(r.kind) ?? [];
    list.push(r);
    byKind.set(r.kind, list);
  }
  const kinds = [...byKind.keys()].sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return kinds.map((kind) => ({ kind, label: SEARCH_KIND_LABELS[kind] ?? kind, rows: byKind.get(kind)! }));
}

export const flattenGroups = (groups: SearchGroup[]): SearchRow[] => groups.flatMap((g) => g.rows);
