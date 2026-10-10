/** Чистые помощники массового сопоставления оргструктуры (M27): подписи причин, сборка пунктов из выбора пользователя, разбиение на вызовы. */
import type { OrgCause, OrgGroup, OrgMapItem, OrgSavedMapping } from "@/app/(app)/imports/orgmap-actions";

export const ORGMAP_ITEMS_MAX = 200;

export const CAUSE_LABEL: Record<OrgCause, string> = {
  RESOLVABLE: "Теперь находится — нужен повторный разбор",
  MAPPED: "Сопоставлено в этом импорте",
  AMBIGUOUS: "Несколько подходящих — нужен явный выбор пути",
  PARENT_UNRESOLVED: "Сначала сопоставьте департамент из файла",
  OTHER_PARENT: "Есть у другого департамента (не того, что в файле)",
  ALIAS_OTHER_PARENT: "Написание закреплено за подразделением другого департамента",
  INACTIVE: "Есть, но неактивно — восстановите в справочнике",
  OTHER_LEVEL: "Есть, но на другом уровне (отдел/департамент)",
  SIMILAR: "Точного нет, есть похожие (авто-объединения нет)",
  MISSING: "Нигде нет в справочнике",
};

export type Choice = "" | "MAP" | "ALIAS" | "CREATE" | "CLEAR";
export type Draft = { action: Choice; orgUnitId?: number; confirmHomonym?: boolean; name?: string };

export const groupKey = (g: Pick<OrgGroup, "kind" | "srcNorm" | "scope">) => `${g.kind}|${g.scope}|${g.srcNorm}`;

/** Пункты для предпросмотра/сохранения: только те значения, по которым пользователь выбрал действие. */
export function buildItems(groups: OrgGroup[], drafts: Record<string, Draft>): OrgMapItem[] {
  const out: OrgMapItem[] = [];
  for (const g of groups) {
    const d = drafts[groupKey(g)];
    if (!d || !d.action) continue;
    if ((d.action === "MAP" || d.action === "ALIAS") && !d.orgUnitId) continue;
    out.push({
      kind: g.kind, srcName: g.srcName, scope: g.scope, action: d.action,
      ...(d.orgUnitId ? { orgUnitId: d.orgUnitId } : {}), ...(d.action === "CREATE" && d.name ? { name: d.name } : {}), ...(d.confirmHomonym ? { confirmHomonym: true } : {}),
    });
  }
  return out;
}

/** Разбиение на вызовы: департаменты — раньше отделов (контекст отдела зависит от сопоставления департамента). Порядок внутри вида сохраняется. */
export function chunkItems<T extends { kind: string }>(items: T[], size = ORGMAP_ITEMS_MAX): T[][] {
  const sorted = [...items.filter((i) => i.kind === "DEPARTMENT"), ...items.filter((i) => i.kind !== "DEPARTMENT")];
  const chunks: T[][] = [];
  for (let i = 0; i < sorted.length; i += size) chunks.push(sorted.slice(i, i + size));
  return chunks;
}

/** Группы, где действие по умолчанию безопасно предложить как «создать»: такого отдела нет в департаменте из файла (нигде нет, либо похожие только у других департаментов) и родитель известен. Всё равно — только после предпросмотра. */
export const canBulkCreate = (g: OrgGroup) => (g.cause === "MISSING" || g.cause === "SIMILAR") && g.recommended === "CREATE";

export type SavedMappingRef = Pick<OrgSavedMapping, "kind" | "srcName" | "scope">;
export const mappingKey = (m: SavedMappingRef) => `${m.kind}|${m.scope}|${m.srcName}`;
/** Пункты «снять сопоставление» для отмеченных сохранённых сопоставлений. */
export const clearItems = (mappings: OrgSavedMapping[], marked: Record<string, boolean>): OrgMapItem[] =>
  mappings.filter((m) => marked[mappingKey(m)]).map((m) => ({ kind: m.kind, srcName: m.srcName, scope: m.scope, action: "CLEAR" as const }));
