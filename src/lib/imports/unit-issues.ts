/**
 * Замечания «Подразделение/Отдел не найдено» в строке импорта. Исходные названия берутся из сообщений строки
 * (их формирует import_analyze_row), поэтому работает и для заданий, загруженных до появления этого механизма.
 * «Неоднозначно» здесь не разрешается созданием: нужно сначала уточнить справочник, поэтому такие названия не возвращаются.
 */
export type UnitIssue = { kind: "DEPARTMENT" | "UNIT"; name: string };

export function parseUnitIssues(messages: string[]): UnitIssue[] {
  const out: UnitIssue[] = [];
  for (const m of messages) {
    const dep = /^Подразделение «(.+)» не найдено$/.exec(m);
    if (dep) { out.push({ kind: "DEPARTMENT", name: dep[1]! }); continue; }
    const unit = /^Отдел «(.+)» не найден$/.exec(m);
    if (unit) out.push({ kind: "UNIT", name: unit[1]! });
  }
  return out;
}
