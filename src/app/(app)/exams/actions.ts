"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { fieldErrorsFrom } from "@/lib/workflows/schemas";
import type { Json } from "@/types/database";
import { cancelExamSchema, createExamSchema, examCostSchema, examResultSchema } from "@/lib/exams/schemas";
import { addEmployeeSkillSchema, upsertGoalSchema, upsertSkillSchema } from "@/lib/exams/dossier-schemas";
import { examResultReasonRequired } from "@/lib/exams/format";

const refresh = (employeeId?: string, examId?: string) => {
  revalidatePath("/exams");
  revalidatePath("/certificates");
  if (examId) revalidatePath(`/exams/${examId}`);
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
};
const firstIssue = (e: { issues: { message: string }[] }) => e.issues[0]?.message ?? WF_ERR.invalid;

export type EmployeeHit = { id: string; full_name: string; position: string | null; code: string };

/** Поиск активных сотрудников для выбора в диалогах (под сессией пользователя, RLS действует). */
export async function searchEmployees(query: string): Promise<Result<EmployeeHit[]>> {
  const actor = await requireRole(WF_ROLES.exam);
  if (!actor.ok) return actor;
  const q = String(query ?? "").replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  if (q.length < 2) return { ok: true, data: [] };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("employees").select("id, full_name, position, canonical_id").eq("is_active", true).ilike("full_name", `%${q}%`).order("full_name").limit(8);
    if (error) return fail(WF_ERR.unavailable);
    return { ok: true, data: (data ?? []).map((e) => ({ id: e.id, full_name: e.full_name, position: e.position, code: e.canonical_id })) };
  } catch {
    return fail(WF_ERR.unavailable);
  }
}

export async function createExam(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.exam);
  if (!actor.ok) return actor;
  const p = createExamSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  const res = await callRpc("create_exam", { p: p.data as unknown as Json });
  if (!res.ok) return res;
  refresh(p.data.employee_id);
  return { ok: true, message: "Экзамен добавлен. Новая попытка записана отдельной строкой.", data: { id: res.data as string } };
}

export async function setExamResult(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.exam);
  if (!actor.ok) return actor;
  const p = examResultSchema.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error), fieldErrorsFrom(p.error));
  const supabase = await createClient();
  const { data: cur } = await supabase.from("exams").select("result, employee_id").eq("id", p.data.id).maybeSingle();
  if (!cur) return fail(WF_ERR.notFound);
  if (examResultReasonRequired(cur.result, p.data.result) && (p.data.reason?.length ?? 0) < 3) return fail(WF_ERR.reason, { reason: WF_ERR.reason });
  const res = await callRpc("set_exam_result", {
    p_id: p.data.id,
    p_result: p.data.result,
    p_score: p.data.score ?? undefined,
    p_note: p.data.note ?? undefined,
    p_reason: p.data.reason ?? undefined,
  });
  if (!res.ok) return res;
  refresh(cur.employee_id, p.data.id);
  return { ok: true, message: "Результат сохранён.", data: undefined };
}

export async function setExamCost(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.examCost);
  if (!actor.ok) return actor;
  const p = examCostSchema.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error), fieldErrorsFrom(p.error));
  const supabase = await createClient();
  const [{ data: ex }, { data: existing }] = await Promise.all([
    supabase.from("exams").select("employee_id").eq("id", p.data.exam_id).maybeSingle(),
    supabase.from("exam_costs").select("exam_id").eq("exam_id", p.data.exam_id).maybeSingle(),
  ]);
  if (!ex) return fail(WF_ERR.notFound);
  if (existing && (p.data.reason?.length ?? 0) < 3) return fail(WF_ERR.reason, { reason: WF_ERR.reason });
  const { exam_id, reason, ...body } = p.data;
  const res = await callRpc("set_exam_cost", { p_exam: exam_id, p: body as unknown as Json, p_reason: reason ?? undefined });
  if (!res.ok) return res;
  refresh(ex.employee_id, exam_id);
  return { ok: true, message: "Стоимость сохранена.", data: undefined };
}

/** Отмена экзамена (статус CANCELLED) — только с причиной. Строка и её история остаются. */
export async function cancelExam(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.exam);
  if (!actor.ok) return actor;
  const p = cancelExamSchema.safeParse(input);
  if (!p.success) return fail(firstIssue(p.error), fieldErrorsFrom(p.error));
  const supabase = await createClient();
  const { data: cur } = await supabase.from("exams").select("employee_id").eq("id", p.data.id).maybeSingle();
  const res = await callRpc("update_exam", { p_id: p.data.id, p_patch: { status: "CANCELLED" }, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(cur?.employee_id, p.data.id);
  return { ok: true, message: "Экзамен отменён.", data: undefined };
}

export async function addEmployeeSkill(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.skill);
  if (!actor.ok) return actor;
  const p = addEmployeeSkillSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  const { reason, ...body } = p.data;
  const res = await callRpc("add_employee_skill", { p: body as unknown as Json, p_reason: reason ?? undefined });
  if (!res.ok) return res;
  refresh(p.data.employee_id);
  return { ok: true, message: "Уровень записан в историю навыков.", data: undefined };
}

export async function upsertSkill(input: unknown): Promise<Result<{ id: number }>> {
  const actor = await requireRole(WF_ROLES.skill);
  if (!actor.ok) return actor;
  const p = upsertSkillSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  const body: Record<string, Json> = { name: p.data.name, kind: p.data.kind };
  if (p.data.is_active !== undefined) body.is_active = p.data.is_active;
  const res = await callRpc("upsert_skill", { p_id: (p.data.id ?? null) as never, p: body });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Справочник навыков обновлён.", data: { id: Number(res.data) } };
}

export async function upsertGoal(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.goal);
  if (!actor.ok) return actor;
  const p = upsertGoalSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  const { id, reason, ...body } = p.data;
  const res = await callRpc("upsert_goal", { p_id: (id ?? null) as never, p: body as unknown as Json, p_reason: reason ?? undefined });
  if (!res.ok) return res;
  refresh(p.data.employee_id);
  return { ok: true, message: id ? "Цель обновлена." : "Цель добавлена в план развития.", data: undefined };
}
