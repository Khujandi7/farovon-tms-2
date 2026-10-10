"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { reason, uuid } from "@/lib/workflows/schemas";
import { ORGMAP_ITEMS_MAX } from "@/lib/imports/orgmap";
import type { Json } from "@/types/database";

/* ---------- Массовое сопоставление оргструктуры в загруженном импорте сотрудников (M27) ----------
 * Единица работы — уникальное значение из файла (вид + написание + контекст родителя), а не строка. Предпросмотр и сохранение выполняет один и тот же
 * код БД (import_orgmap_apply), поэтому предпросмотр точно показывает, что будет сохранено. Сохранение требует причину и явного подтверждения. */

export type OrgCause = "RESOLVABLE" | "MAPPED" | "AMBIGUOUS" | "PARENT_UNRESOLVED" | "OTHER_PARENT" | "ALIAS_OTHER_PARENT" | "INACTIVE" | "OTHER_LEVEL" | "SIMILAR" | "MISSING";
export type OrgRecommended = "REANALYZE" | "DEPT_FIRST" | "CREATE" | "DECIDE";
export type OrgCandidate = {
  id: number; level: "DEPARTMENT" | "UNIT"; name: string; path: string; parentId: number | null;
  kind: "EXACT" | "ALIAS" | "SIMILAR" | "INACTIVE" | "OTHER_LEVEL" | "PATH_RECORD"; allowed: boolean; why: string | null;
};
export type OrgGroup = {
  kind: "DEPARTMENT" | "UNIT"; srcName: string; srcNorm: string; scope: string; scopeLabel: string; rows: number; sampleRows: number[]; srcPath: string | null;
  cause: OrgCause; recommended: OrgRecommended; mappedTo: { id: number; path: string } | null; resolvedTo: { id: number; path: string } | null; candidates: OrgCandidate[];
};
/** Сохранённое в задании сопоставление; invalid — почему оно недопустимо (например, цель — запись-путь «A → B»). */
export type OrgSavedMapping = { kind: "DEPARTMENT" | "UNIT"; srcName: string; scope: string; scopeLabel: string; orgUnitId: number; path: string; invalid: string | null; openRows: number };
export type OrgScan = {
  jobStatus: string; groups: number; mappedGroups: number; savedMappings: number; mappings: OrgSavedMapping[];
  offset: number; limit: number; rowsWithUnitIssue: number; duplicates: number;
  protectedApplied: number; protectedSkippedByDecision: number;
  byCause: Array<{ cause: OrgCause; groups: number; rows: number }>;
  reviewBreakdown: Array<{ code: string; rows: number; withUnitIssue: number }>;
  list: OrgGroup[];
};

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const rec = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const CAUSES: OrgCause[] = ["RESOLVABLE", "MAPPED", "AMBIGUOUS", "PARENT_UNRESOLVED", "OTHER_PARENT", "ALIAS_OTHER_PARENT", "INACTIVE", "OTHER_LEVEL", "SIMILAR", "MISSING"];
const pathOf = (v: unknown) => { const o = rec(v); return o.id != null ? { id: num(o.id), path: String(o.path ?? "") } : null; };

function parseScan(o: Record<string, unknown>): OrgScan {
  const byCause = Object.entries(rec(o.by_cause)).filter(([k]) => (CAUSES as string[]).includes(k)).map(([k, v]) => ({ cause: k as OrgCause, groups: num(rec(v).groups), rows: num(rec(v).rows) }));
  const breakdown = Array.isArray(o.review_breakdown) ? (o.review_breakdown as unknown[]).map((b) => ({ code: String(rec(b).code ?? "—"), rows: num(rec(b).rows), withUnitIssue: num(rec(b).with_unit_issue) })) : [];
  const list = Array.isArray(o.groups_list) ? (o.groups_list as unknown[]).map((raw): OrgGroup => {
    const g = rec(raw);
    const cands = Array.isArray(g.candidates) ? (g.candidates as unknown[]).map((c): OrgCandidate => {
      const x = rec(c);
      return {
        id: num(x.id), level: x.level === "UNIT" ? "UNIT" : "DEPARTMENT", name: String(x.name ?? ""), path: String(x.path ?? x.name ?? ""), parentId: x.parent_id == null ? null : num(x.parent_id),
        kind: (["EXACT", "ALIAS", "SIMILAR", "INACTIVE", "OTHER_LEVEL", "PATH_RECORD"].includes(String(x.kind)) ? String(x.kind) : "SIMILAR") as OrgCandidate["kind"], allowed: x.allowed === true, why: typeof x.why === "string" ? x.why : null,
      };
    }) : [];
    return {
      kind: g.kind === "UNIT" ? "UNIT" : "DEPARTMENT", srcName: String(g.src_name ?? ""), srcNorm: String(g.src_norm ?? ""), scope: String(g.scope ?? ""), scopeLabel: String(g.scope_label ?? ""), rows: num(g.rows),
      sampleRows: Array.isArray(g.sample_rows) ? (g.sample_rows as unknown[]).map(num) : [], srcPath: typeof g.src_path === "string" && g.src_path ? g.src_path : null,
      cause: ((CAUSES as string[]).includes(String(g.cause)) ? String(g.cause) : "MISSING") as OrgCause,
      recommended: (["REANALYZE", "DEPT_FIRST", "CREATE", "DECIDE"].includes(String(g.action)) ? String(g.action) : "DECIDE") as OrgRecommended,
      mappedTo: pathOf(g.mapped_to), resolvedTo: pathOf(g.resolved_to), candidates: cands,
    };
  }) : [];
  const mappings = Array.isArray(o.mappings) ? (o.mappings as unknown[]).map((raw): OrgSavedMapping => {
    const m = rec(raw);
    return { kind: m.kind === "UNIT" ? "UNIT" : "DEPARTMENT", srcName: String(m.src_name ?? ""), scope: String(m.scope ?? ""), scopeLabel: String(m.scope_label ?? ""), orgUnitId: num(m.org_unit_id), path: String(m.path ?? ""), invalid: typeof m.invalid === "string" ? m.invalid : null, openRows: num(m.open_rows) };
  }) : [];
  return {
    jobStatus: String(o.job_status ?? ""), groups: num(o.groups), mappedGroups: num(o.mapped_groups), savedMappings: num(o.saved_mappings), mappings, offset: num(o.offset), limit: num(o.limit), rowsWithUnitIssue: num(o.rows_with_unit_issue), duplicates: num(o.duplicates),
    protectedApplied: num(rec(o.protected).applied), protectedSkippedByDecision: num(rec(o.protected).skipped_by_decision), byCause, reviewBreakdown: breakdown, list,
  };
}

/** Скан задания: уникальные значения подразделений из файла с кандидатами, причиной и рекомендацией. Ничего не пишет. */
export async function scanOrgMap(input: unknown): Promise<Result<OrgScan>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = z.object({ jobId: uuid, offset: z.coerce.number().int().min(0).max(100000).default(0), limit: z.coerce.number().int().min(1).max(500).default(300) }).safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid);
  const res = await callRpc("import_orgmap_scan", { p_job: p.data.jobId, p_limit: p.data.limit, p_offset: p.data.offset });
  if (!res.ok) return res;
  return { ok: true, data: parseScan(rec(res.data)) };
}

const itemSchema = z.object({
  kind: z.enum(["DEPARTMENT", "UNIT"]),
  srcName: z.string().trim().min(1).max(300),
  scope: z.string().max(320).regex(/^(?:|D:.+|P:[0-9]+)$/, { message: "Неверный контекст" }),
  action: z.enum(["MAP", "ALIAS", "CREATE", "CLEAR"]),
  orgUnitId: z.coerce.number().int().min(1).max(2_000_000_000).optional(),
  name: z.string().trim().min(2).max(200).optional(),
  confirmHomonym: z.boolean().optional(),
});
export type OrgMapItem = z.input<typeof itemSchema>;
export type OrgMapItemResult = { index: number; kind: "DEPARTMENT" | "UNIT"; srcName: string; scope: string; action: string; ok: boolean; changed: boolean; rows: number; aliasAdded: boolean; createdId: number | null; error: string | null };
export type OrgMapResult = { dry: boolean; ok: number; failed: number; mapped: number; aliases: number; created: number; cleared: number; rowsAffected: number; items: OrgMapItemResult[] };

function toRpcItems(items: z.output<typeof itemSchema>[]): Json {
  return items.map((i) => ({
    kind: i.kind, src_name: i.srcName, scope: i.scope, action: i.action,
    ...(i.orgUnitId != null ? { org_unit_id: i.orgUnitId } : {}), ...(i.name ? { name: i.name } : {}), ...(i.confirmHomonym ? { confirm_homonym: true } : {}),
  })) as Json;
}

function parseResult(o: Record<string, unknown>): OrgMapResult {
  const items = Array.isArray(o.items) ? (o.items as unknown[]).map((raw): OrgMapItemResult => {
    const x = rec(raw);
    return {
      index: num(x.index), kind: x.kind === "UNIT" ? "UNIT" : "DEPARTMENT", srcName: String(x.src_name ?? ""), scope: String(x.scope ?? ""), action: String(x.action ?? ""), ok: x.ok === true, changed: x.changed === true,
      rows: num(x.rows), aliasAdded: x.alias_added === true, createdId: x.created_id == null ? null : num(x.created_id), error: typeof x.error === "string" ? x.error : null,
    };
  }) : [];
  return { dry: o.dry === true, ok: num(o.ok), failed: num(o.failed), mapped: num(o.mapped), aliases: num(o.aliases), created: num(o.created), cleared: num(o.cleared), rowsAffected: num(o.rows_affected), items };
}

/** Предпросмотр сопоставления (ничего не сохраняет): тот же код БД, что и при сохранении, изменения откатываются. */
export async function previewOrgMap(input: unknown): Promise<Result<OrgMapResult>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = z.object({ jobId: uuid, items: z.array(itemSchema).min(1).max(ORGMAP_ITEMS_MAX) }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid);
  const res = await callRpc("import_orgmap_apply", { p_job: p.data.jobId, p_items: toRpcItems(p.data.items), p_dry: true });
  if (!res.ok) return res;
  return { ok: true, data: parseResult(rec(res.data)) };
}

/** Сохранение сопоставления. Только после предпросмотра и явного подтверждения (confirmed) с причиной; повтор идемпотентен. */
export async function saveOrgMap(input: unknown): Promise<Result<OrgMapResult>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = z.object({ jobId: uuid, items: z.array(itemSchema).min(1).max(ORGMAP_ITEMS_MAX), reason, confirmed: z.literal(true, { message: "Подтвердите сопоставление" }) }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid);
  const res = await callRpc("import_orgmap_apply", { p_job: p.data.jobId, p_items: toRpcItems(p.data.items), p_dry: false, p_reason: p.data.reason });
  if (!res.ok) return res;
  revalidatePath(`/imports/${p.data.jobId}`);
  revalidatePath("/settings/references");
  return { ok: true, data: parseResult(rec(res.data)) };
}

export type OrgReanalyzeStep = { processed: number; resolved: number; unresolved: number; errors: number; remaining: number; nextAfter: number; done: boolean; firstError: string | null };

/** Шаг пакетного повторного разбора ВСЕХ нерешённых строк с замечанием по подразделению (любой код проверки). Сотрудников не создаёт. */
export async function reanalyzeOrgMapBatch(input: unknown): Promise<Result<OrgReanalyzeStep>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = z.object({ jobId: uuid, after: z.coerce.number().int().min(0).max(2_000_000_000).default(0), limit: z.coerce.number().int().min(1).max(500).default(200) }).safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid);
  const res = await callRpc("import_orgmap_reanalyze_batch", { p_job: p.data.jobId, p_limit: p.data.limit, p_after: p.data.after });
  if (!res.ok) return res;
  const o = rec(res.data);
  revalidatePath(`/imports/${p.data.jobId}`);
  return {
    ok: true,
    data: { processed: num(o.processed), resolved: num(o.resolved), unresolved: num(o.unresolved), errors: num(o.errors), remaining: num(o.remaining), nextAfter: num(o.next_after), done: o.done === true, firstError: typeof o.first_error === "string" ? o.first_error : null },
  };
}
