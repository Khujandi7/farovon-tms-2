/**
 * Массовое добавление подразделений: разбор вставленной таблицы и предпросмотр до записи.
 * Формат строки: «Департамент» или «Департамент ⇥ Отдел» (разделитель — табуляция, «;» или «|»; из Excel вставляется табуляцией).
 * Первая строка-заголовок («Департамент…», «Название…») пропускается. Предпросмотр чисто клиентский и ничего не пишет;
 * окончательную проверку дубликатов и прав делает база (create_org_units_bulk), поэтому итог может быть чуть строже.
 */

export type BulkInputRow = { name: string; parent: string | null };
export type PreviewStatus = "NEW" | "DUPLICATE" | "ERROR";
export type PreviewRow = { line: number; name: string; parent: string | null; kind: "DEPARTMENT" | "UNIT"; status: PreviewStatus; note?: string };
export type ExistingUnit = { id: number; name: string; parent_id: number | null; level: "DEPARTMENT" | "UNIT"; is_active: boolean };
export type ExistingAlias = { org_unit_id: number; alias_norm: string };
export type BulkPreview = { rows: PreviewRow[]; toCreate: BulkInputRow[]; counts: { new: number; duplicate: number; error: number } };

export const BULK_MAX_ROWS = 1000;

/** Нормализация как norm_name в БД: регистр, ё/е, знаки препинания → пробел, пробелы схлопнуты. Разные названия по «похожести» НЕ сводятся. */
export const normUnitName = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();

const HEADER = /^(департамент|подразделение|название|управление)(?![\p{L}\p{N}])/iu;

export function parseBulkText(text: string): { rows: Array<{ line: number; dept: string; unit: string | null }>; tooMany: boolean } {
  const rows: Array<{ line: number; dept: string; unit: string | null }> = [];
  const lines = text.split(/\r?\n/);
  let first = true;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.trim();
    if (!raw) continue;
    const parts = raw.split(/\t|;|\|/).map((p) => p.trim());
    if (first) {
      first = false;
      if (HEADER.test(parts[0] ?? "") && parts.length > 1 && /отдел|подраздел/i.test(parts[1] ?? "")) continue; // строка-заголовок
    }
    rows.push({ line: i + 1, dept: parts[0] ?? "", unit: parts[1] ? parts[1] : null });
  }
  return { rows, tooMany: rows.length > BULK_MAX_ROWS };
}

export function previewBulk(text: string, existing: ExistingUnit[], aliases: ExistingAlias[] = []): BulkPreview {
  const { rows: parsed, tooMany } = parseBulkText(text);
  const out: PreviewRow[] = [];
  const toCreate: BulkInputRow[] = [];
  const depByName = new Map(existing.filter((u) => u.level === "DEPARTMENT").map((u) => [normUnitName(u.name), u] as const));
  const unitKeys = new Set(existing.filter((u) => u.level === "UNIT").map((u) => `${u.parent_id}|${normUnitName(u.name)}`));
  const aliasOwner = new Map(aliases.map((a) => [a.alias_norm, existing.find((u) => u.id === a.org_unit_id)] as const));
  const plannedDeps = new Set<string>();
  const plannedUnits = new Set<string>();

  if (tooMany) {
    return { rows: [{ line: 0, name: "", parent: null, kind: "DEPARTMENT", status: "ERROR", note: `Не больше ${BULK_MAX_ROWS} строк за раз` }], toCreate: [], counts: { new: 0, duplicate: 0, error: 1 } };
  }

  const addDept = (line: number, name: string): PreviewRow => {
    const key = normUnitName(name);
    const ex = depByName.get(key);
    const viaAlias = !ex ? aliasOwner.get(key) : undefined;
    if (viaAlias && viaAlias.level === "DEPARTMENT") return { line, name, parent: null, kind: "DEPARTMENT", status: "DUPLICATE", note: `Совпадает с подтверждённым написанием «${viaAlias.name}»` };
    if (ex) return { line, name, parent: null, kind: "DEPARTMENT", status: "DUPLICATE", note: ex.is_active ? "Уже есть в справочнике" : "Уже есть (неактивен) — восстановите вместо создания" };
    if (plannedDeps.has(key)) return { line, name, parent: null, kind: "DEPARTMENT", status: "DUPLICATE", note: "Повтор в списке" };
    plannedDeps.add(key);
    toCreate.push({ name, parent: null });
    return { line, name, parent: null, kind: "DEPARTMENT", status: "NEW" };
  };

  for (const p of parsed) {
    if (p.dept.length < 2) { out.push({ line: p.line, name: p.dept, parent: null, kind: "DEPARTMENT", status: "ERROR", note: "Название короче 2 символов" }); continue; }
    if (p.dept.length > 200 || (p.unit?.length ?? 0) > 200) { out.push({ line: p.line, name: p.dept, parent: null, kind: "DEPARTMENT", status: "ERROR", note: "Название длиннее 200 символов" }); continue; }
    if (p.unit === null) { out.push(addDept(p.line, p.dept)); continue; }
    if (p.unit.length < 2) { out.push({ line: p.line, name: p.unit, parent: p.dept, kind: "UNIT", status: "ERROR", note: "Название отдела короче 2 символов" }); continue; }
    const dKey = normUnitName(p.dept);
    const aliasDep = aliasOwner.get(dKey);
    const dep = depByName.get(dKey) ?? (aliasDep?.level === "DEPARTMENT" ? aliasDep : undefined);
    if (dep && !dep.is_active) { out.push({ line: p.line, name: p.unit, parent: p.dept, kind: "UNIT", status: "ERROR", note: "Департамент неактивен — сначала восстановите его" }); continue; }
    // департамент отдела: уже есть, либо создаётся строкой выше, либо будет создан из этой строки (создаём явно, чтобы пользователь видел)
    if (!dep && !plannedDeps.has(dKey)) out.push(addDept(p.line, p.dept));
    const uKey = `${dep ? dep.id : `new:${dKey}`}|${normUnitName(p.unit)}`;
    const unitAlias = aliasOwner.get(normUnitName(p.unit));
    if (dep && unitAlias && unitAlias.level === "UNIT" && unitAlias.parent_id === dep.id) { out.push({ line: p.line, name: p.unit, parent: p.dept, kind: "UNIT", status: "DUPLICATE", note: `Совпадает с подтверждённым написанием «${unitAlias.name}»` }); continue; }
    if (unitKeys.has(uKey) || plannedUnits.has(uKey)) { out.push({ line: p.line, name: p.unit, parent: p.dept, kind: "UNIT", status: "DUPLICATE", note: unitKeys.has(uKey) ? "Уже есть в этом департаменте" : "Повтор в списке" }); continue; }
    plannedUnits.add(uKey);
    toCreate.push({ name: p.unit, parent: p.dept });
    out.push({ line: p.line, name: p.unit, parent: p.dept, kind: "UNIT", status: "NEW" });
  }
  const counts = { new: out.filter((r) => r.status === "NEW").length, duplicate: out.filter((r) => r.status === "DUPLICATE").length, error: out.filter((r) => r.status === "ERROR").length };
  return { rows: out, toCreate, counts };
}

/** Кандидаты для сопоставления из замечания «Подразделение не найдено»: только подтверждение человеком, без авто-слияния по похожести. */
export function suggestUnits(name: string, units: ExistingUnit[], level: "DEPARTMENT" | "UNIT"): ExistingUnit[] {
  const n = normUnitName(name);
  const stems = n.split(" ").filter((w) => w.length > 3).map((w) => w.slice(0, Math.max(4, w.length - 2))); // основа слова: «бройлерное» ~ «бройлерного»
  return units
    .filter((u) => u.level === level && u.is_active)
    .map((u) => ({ u, score: stems.filter((w) => normUnitName(u.name).includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.u);
}
