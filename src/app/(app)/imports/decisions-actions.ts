"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { reason, uuid } from "@/lib/workflows/schemas";

/** Решения по сотрудникам в применённом импорте (M30): сводка, массовые решения, применение решений пакетами. */

export type DecisionsSummary = { jobStatus: string; total: number; undecided: number; toCreate: number; toMatch: number; toSkip: number; errors: number };
export type BulkDecisionStep = { changed: number; remaining: number; done: boolean };
export type ApplyDecisionsStep = { processed: number; created: number; updated: number; errors: number; remaining: number; nextAfter: number; done: boolean };

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const refresh = (jobId: string) => {
  revalidatePath("/imports");
  revalidatePath("/data-quality");
  revalidatePath(`/imports/${jobId}`);
};

export async function getDecisionsSummary(input: unknown): Promise<Result<DecisionsSummary>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = z.object({ jobId: uuid }).safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid);
  const res = await callRpc("import_decisions_summary", { p_job: p.data.jobId });
  if (!res.ok) return res;
  const o = (res.data ?? {}) as Record<string, unknown>;
  return { ok: true, data: { jobStatus: String(o.job_status ?? ""), total: num(o.total), undecided: num(o.undecided), toCreate: num(o.to_create), toMatch: num(o.to_match), toSkip: num(o.to_skip), errors: num(o.errors) } };
}

/** Массовое решение «создать как новых» / «пропустить» / «снять решение». rowIds не заданы — все подходящие строки задания (шагами по 300). */
export async function resolveImportRowsBulk(input: unknown): Promise<Result<BulkDecisionStep>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = z.object({ jobId: uuid, decision: z.enum(["APPLY", "SKIP", "CLEAR"]), rowIds: z.array(z.number().int().positive()).max(500).optional() }).safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid);
  const res = await callRpc("import_resolve_rows_bulk", { p_job: p.data.jobId, p_decision: p.data.decision, p_rows: p.data.rowIds, p_limit: 300 });
  if (!res.ok) return res;
  const o = (res.data ?? {}) as Record<string, unknown>;
  refresh(p.data.jobId);
  const out: BulkDecisionStep = { changed: num(o.changed), remaining: num(o.remaining), done: o.done === true };
  return { ok: true, message: out.done ? "Решения сохранены." : `Сохранено решений: ${out.changed}…`, data: out };
}

/** Шаг применения решений. Требует причину; повтор и возобновление безопасны (применённые строки не берутся снова). */
export async function applyImportDecisions(input: unknown): Promise<Result<ApplyDecisionsStep>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = z.object({
    jobId: uuid,
    after: z.coerce.number().int().min(0).max(2_000_000_000).default(0),
    limit: z.coerce.number().int().min(1).max(100).default(40),
    reason,
    confirmed: z.literal(true, { message: "Подтвердите применение" }),
  }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid);
  const res = await callRpc("import_apply_decided_batch", { p_job: p.data.jobId, p_limit: p.data.limit, p_after: p.data.after, p_reason: p.data.reason });
  if (!res.ok) return res;
  const o = (res.data ?? {}) as Record<string, unknown>;
  refresh(p.data.jobId);
  const out: ApplyDecisionsStep = { processed: num(o.processed), created: num(o.created), updated: num(o.updated), errors: num(o.errors), remaining: num(o.remaining), nextAfter: num(o.next_after), done: o.done === true };
  if (out.done) revalidatePath("/employees");
  return { ok: true, message: out.done ? "Решения применены." : `Обработано строк: ${out.processed}…`, data: out };
}
