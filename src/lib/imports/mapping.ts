import { ENTITY_DEFS, type ImportEntity } from "./entities";

/** key поля → индекс колонки (или null — не сопоставлено). */
export type ColumnMapping = Record<string, number | null>;

export function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[_\-./\\()[\]:;,*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Автосопоставление колонок по синонимам. Точное совпадение важнее частичного (заголовок содержит синоним целиком);
 * одна колонка не назначается двум полям.
 */
export function autoMap(headers: string[], entity: ImportEntity): ColumnMapping {
  const fields = ENTITY_DEFS[entity].fields;
  const norm = headers.map(normalizeHeader);
  const mapping: ColumnMapping = Object.fromEntries(fields.map((f) => [f.key, null]));
  const used = new Set<number>();
  const pass = (match: (h: string, syn: string) => boolean) => {
    for (const f of fields) {
      if (mapping[f.key] !== null) continue;
      const syns = [normalizeHeader(f.label), ...f.synonyms.map(normalizeHeader)];
      // более ранний синоним = приоритетнее
      for (const syn of syns) {
        const idx = norm.findIndex((h, i) => !used.has(i) && h !== "" && match(h, syn));
        if (idx >= 0) {
          mapping[f.key] = idx;
          used.add(idx);
          break;
        }
      }
    }
  };
  pass((h, s) => h === s);
  pass((h, s) => s.length >= 4 && (` ${h} `.includes(` ${s} `)));
  return mapping;
}

export function missingRequired(mapping: ColumnMapping, entity: ImportEntity): string[] {
  const fields = ENTITY_DEFS[entity].fields;
  const out: string[] = [];
  for (const f of fields) if (f.required && mapping[f.key] == null) out.push(f.label);
  const groups = new Map<string, typeof fields>();
  for (const f of fields) if (f.anyOf) groups.set(f.anyOf, [...(groups.get(f.anyOf) ?? []), f]);
  for (const g of groups.values()) if (g.every((f) => mapping[f.key] == null)) out.push(g.map((f) => f.label).join(" или "));
  return out;
}
