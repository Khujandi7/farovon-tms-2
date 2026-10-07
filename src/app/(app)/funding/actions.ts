"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ERR } from "@/lib/workflows/errors";
import { WF_ROLES } from "@/lib/workflows/roles";
import { fieldErrorsFrom, reason, uuid } from "@/lib/workflows/schemas";
import { agreementPatchSchema, createAgreementSchema, evaluateSchema, policySchema, reasonOnlySchema, repaymentSchema, reviewSchema } from "@/lib/funding/schemas";
import type { Json } from "@/types/database";

const firstIssue = (e: z.ZodError) => e.issues[0]?.message ?? WF_ERR.invalid;

function refresh(opts: { id?: string; employeeId?: string; policies?: boolean } = {}) {
  revalidatePath("/funding");
  if (opts.policies) revalidatePath("/funding/policies");
  if (opts.id) revalidatePath(`/funding/${opts.id}`);
  if (opts.employeeId) revalidatePath(`/employees/${opts.employeeId}`);
}

/** Employee id нужен только для обновления досье: читаем под сессией, при ошибке просто пропускаем. */
async function employeeOf(agreementId: string): Promise<string | undefined> {
  try {
    
    const supabase = await createClient();
    const { data } = await supabase.from("learning_agreements").select("employee_id").eq("id", agreementId).maybeSingle();
    return data?.employee_id;
  } catch {
    return undefined;
  }
}

// ---------- Политики ----------

/** Создать политику или изменить черновик. Подтверждённая политика неизменяема (проверяет БД). */
export async function savePolicy(input: { id?: string | null; values: unknown; reason?: string | null }): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.fundingPolicy);
  if (!actor.ok) return actor;
  const id = input.id ? uuid.safeParse(input.id) : null;
  if (id && !id.success) return fail(WF_ERR.notFound);
  const parsed = policySchema.safeParse(input.values);
  if (!parsed.success) return fail(firstIssue(parsed.error), fieldErrorsFrom(parsed.error));
  const v = parsed.data;
  const p = {
    name: v.name,
    scope: v.scope,
    company_coverage_percent: v.company_coverage_percent,
    currency: v.currency ?? "",
    effective_from: v.effective_from,
    effective_to: v.effective_to ?? "",
    basis: v.basis ?? "",
    outcomes: v.outcomes,
  };
  const res = await callRpc("upsert_funding_policy", { p_id: (id?.data ?? null) as never, p: p as unknown as Json, p_reason: input.reason?.trim() || undefined });
  if (!res.ok) return res;
  refresh({ policies: true });
  return { ok: true, message: id ? "Черновик политики сохранён." : "Политика создана как черновик.", data: { id: res.data as string } };
}

export async function confirmPolicy(input: { id: string; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.fundingPolicy);
  if (!actor.ok) return actor;
  const p = reasonOnlySchema.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error), fieldErrorsFrom(p.error));
  const res = await callRpc("confirm_funding_policy", { p_id: p.data.id, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh({ policies: true });
  return { ok: true, message: "Политика подтверждена и больше не изменяется.", data: undefined };
}

export async function setPolicyActive(input: { id: string; active: boolean; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.fundingPolicy);
  if (!actor.ok) return actor;
  const p = reasonOnlySchema.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error), fieldErrorsFrom(p.error));
  const res = await callRpc("upsert_funding_policy", { p_id: p.data.id as never, p: { is_active: !!input.active } as Json, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh({ policies: true });
  return { ok: true, message: input.active ? "Политика включена." : "Политика отключена: новые соглашения по ней создавать нельзя.", data: undefined };
}

// ---------- Соглашения ----------

export async function createAgreement(input: { values: unknown; reason?: string | null }): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.agreement);
  if (!actor.ok) return actor;
  const parsed = createAgreementSchema.safeParse(input.values);
  if (!parsed.success) return fail(firstIssue(parsed.error), fieldErrorsFrom(parsed.error));
  const res = await callRpc("create_agreement", { p: parsed.data as unknown as Json, p_reason: input.reason?.trim() || undefined });
  if (!res.ok) return res;
  refresh({ employeeId: parsed.data.employee_id });
  return { ok: true, message: "Соглашение создано. Обязательство ещё не рассчитано.", data: { id: res.data as string } };
}

export async function updateAgreement(input: { id: string; patch: unknown; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.agreement);
  if (!actor.ok) return actor;
  const id = uuid.safeParse(input.id);
  if (!id.success) return fail(WF_ERR.notFound);
  const patch = agreementPatchSchema.safeParse(input.patch);
  if (!patch.success) return fail(firstIssue(patch.error), fieldErrorsFrom(patch.error));
  const r = reason.safeParse(input.reason);
  if (!r.success) return fail(firstIssue(r.error), { reason: firstIssue(r.error) });
  if (Object.keys(patch.data).length === 0) return fail("Нет изменений.");
  const res = await callRpc("update_agreement", { p_id: id.data, p_patch: patch.data as unknown as Json, p_reason: r.data });
  if (!res.ok) return res;
  refresh({ id: id.data, employeeId: await employeeOf(id.data) });
  return { ok: true, message: "Соглашение обновлено.", data: undefined };
}

export type EvaluateOutcome = { outcome: string; employee_responsibility_percent: number; repayment_amount: number; status: string; needs_review: boolean };

/** Расчёт обязательства по подтверждённой политике и договору. Деньги не списываются: обязательство уходит на проверку человеком. */
export async function evaluateAgreement(input: { id: string; reason?: string | null }): Promise<Result<EvaluateOutcome | null>> {
  const actor = await requireRole(WF_ROLES.agreement);
  if (!actor.ok) return actor;
  const p = evaluateSchema.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error));
  const res = await callRpc("evaluate_agreement", { p_id: p.data.id, p_reason: p.data.reason ?? undefined });
  if (!res.ok) return res;
  refresh({ id: p.data.id, employeeId: await employeeOf(p.data.id) });
  const out = res.data as Partial<EvaluateOutcome> | null;
  const needs = !!out?.needs_review;
  return {
    ok: true,
    message: needs ? "Обязательство рассчитано. Требуется проверка ответственным сотрудником (юридические ограничения)." : "Расчёт выполнен: обязательства у сотрудника нет.",
    data: out && typeof out.status === "string" ? (out as EvaluateOutcome) : null,
  };
}

export async function reviewObligation(input: { id: string; note?: string | null; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.agreementFinance);
  if (!actor.ok) return actor;
  const p = reviewSchema.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error), fieldErrorsFrom(p.error));
  const res = await callRpc("review_obligation", { p_id: p.data.id, p_note: p.data.note ?? "", p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh({ id: p.data.id, employeeId: await employeeOf(p.data.id) });
  return { ok: true, message: "Обязательство проверено. Можно вносить погашения.", data: undefined };
}

export async function cancelAgreement(input: { id: string; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.agreementFinance);
  if (!actor.ok) return actor;
  const p = reasonOnlySchema.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error), fieldErrorsFrom(p.error));
  const res = await callRpc("cancel_agreement", { p_id: p.data.id, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh({ id: p.data.id, employeeId: await employeeOf(p.data.id) });
  return { ok: true, message: "Соглашение отменено.", data: undefined };
}

// ---------- Погашения ----------

export async function recordRepayment(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.agreementFinance);
  if (!actor.ok) return actor;
  const p = repaymentSchema.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error), fieldErrorsFrom(p.error));
  const res = await callRpc("record_repayment", { p_agreement: p.data.agreementId, p_amount: p.data.amount, p_paid_on: p.data.paid_on, p_comment: p.data.comment ?? undefined });
  if (!res.ok) return res;
  refresh({ id: p.data.agreementId, employeeId: await employeeOf(p.data.agreementId) });
  return { ok: true, message: "Погашение записано.", data: { id: res.data as string } };
}

export async function voidRepayment(input: { id: string; agreementId: string; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.agreementFinance);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, agreementId: uuid, reason }).safeParse(input);
  if (!p.success) return fail(firstIssue(p.error), fieldErrorsFrom(p.error));
  const res = await callRpc("void_repayment", { p_id: p.data.id, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh({ id: p.data.agreementId, employeeId: await employeeOf(p.data.agreementId) });
  return { ok: true, message: "Погашение аннулировано.", data: undefined };
}
