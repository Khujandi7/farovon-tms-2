import { describe, expect, it, vi } from "vitest";
import type { OrgGroup } from "@/app/(app)/imports/orgmap-actions";

vi.mock("@/app/(app)/imports/orgmap-actions", () => ({ reanalyzeOrgMapBatch: vi.fn(), saveOrgMap: vi.fn(), previewOrgMap: vi.fn() }));

import { buildItems, canBulkCreate, chunkItems, clearItems, groupKey, mappingKey } from "./orgmap";
import { onlyAccepted } from "./orgmap-run";

const g = (over: Partial<OrgGroup>): OrgGroup => ({ kind: "UNIT", srcName: "Кадры", srcNorm: "кадры", scope: "P:1", scopeLabel: "Управление А", rows: 2, sampleRows: [], srcPath: null, cause: "SIMILAR", recommended: "DECIDE", mappedTo: null, resolvedTo: null, candidates: [], ...over });

describe("buildItems", () => {
  it("берёт только значения с выбранным действием; MAP/ALIAS без цели пропускаются", () => {
    const a = g({}), b = g({ srcName: "Склад", srcNorm: "склад" }), c = g({ srcName: "Цех", srcNorm: "цех" });
    const items = buildItems([a, b, c], { [groupKey(a)]: { action: "MAP", orgUnitId: 5 }, [groupKey(b)]: { action: "ALIAS" }, [groupKey(c)]: { action: "CREATE", confirmHomonym: true, name: "Цех 1" } });
    expect(items).toEqual([
      { kind: "UNIT", srcName: "Кадры", scope: "P:1", action: "MAP", orgUnitId: 5 },
      { kind: "UNIT", srcName: "Цех", scope: "P:1", action: "CREATE", name: "Цех 1", confirmHomonym: true },
    ]);
  });
  it("одно и то же написание в разных контекстах — разные ключи (не смешиваются)", () => {
    expect(groupKey(g({ scope: "P:1" }))).not.toBe(groupKey(g({ scope: "P:2" })));
  });
});

describe("chunkItems", () => {
  it("департаменты идут раньше отделов, части не больше 50", () => {
    const items = [...Array.from({ length: 250 }, (_, i) => ({ kind: "UNIT", i })), { kind: "DEPARTMENT", i: -1 }];
    const parts = chunkItems(items);
    expect(parts.map((p) => p.length)).toEqual([50, 50, 50, 50, 50, 1]);
    expect(parts[0]?.[0]).toEqual({ kind: "DEPARTMENT", i: -1 });
  });
});

describe("canBulkCreate / onlyAccepted", () => {
  it("массово «создать» предлагается только для значений, которых нигде нет", () => {
    expect(canBulkCreate(g({ cause: "MISSING", recommended: "CREATE" }))).toBe(true);
    expect(canBulkCreate(g({ cause: "OTHER_PARENT", recommended: "DECIDE" }))).toBe(false);
    expect(canBulkCreate(g({ cause: "SIMILAR", recommended: "DECIDE" }))).toBe(false);
    // похожие отделы только у других департаментов (сервер рекомендует «создать») — можно отметить массово, но сохранение всё равно после предпросмотра
    expect(canBulkCreate(g({ cause: "SIMILAR", recommended: "CREATE" }))).toBe(true);
    expect(canBulkCreate(g({ cause: "PARENT_UNRESOLVED", recommended: "DEPT_FIRST" }))).toBe(false);
    expect(canBulkCreate(g({ cause: "MISSING", recommended: "DECIDE" }))).toBe(false);
  });
  it("на сохранение идут только пункты, допустимые по предпросмотру", () => {
    const items = [{ kind: "UNIT" as const, srcName: "А", scope: "P:1", action: "MAP" as const, orgUnitId: 1 }, { kind: "UNIT" as const, srcName: "Б", scope: "P:1", action: "MAP" as const, orgUnitId: 2 }];
    const res = { ok: 1, failed: 1, mapped: 1, aliases: 0, created: 0, cleared: 0, rowsAffected: 1, items: [
      { index: 1, kind: "UNIT" as const, srcName: "А", scope: "P:1", action: "MAP", ok: true, changed: true, rows: 1, aliasAdded: false, createdId: null, error: null },
      { index: 2, kind: "UNIT" as const, srcName: "Б", scope: "P:1", action: "MAP", ok: false, changed: false, rows: 0, aliasAdded: false, createdId: null, error: "x" }] };
    expect(onlyAccepted(items, res)).toEqual([items[0]]);
  });
});

describe("clearItems", () => {
  it("формирует пункты CLEAR только для отмеченных сохранённых сопоставлений", () => {
    const a = { kind: "DEPARTMENT" as const, srcName: "Продажи Х (Опт)", scope: "", scopeLabel: "", orgUnitId: 172, path: "A → B", invalid: "Запись-путь", openRows: 3 };
    const b = { kind: "UNIT" as const, srcName: "Цех", scope: "P:1", scopeLabel: "Управление", orgUnitId: 5, path: "Управление › Цех", invalid: null, openRows: 0 };
    expect(clearItems([a, b], { [mappingKey(a)]: true })).toEqual([{ kind: "DEPARTMENT", srcName: "Продажи Х (Опт)", scope: "", action: "CLEAR" }]);
    expect(clearItems([a, b], {})).toEqual([]);
  });
});
