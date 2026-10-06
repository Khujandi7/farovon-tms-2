"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { createClient } from "@/lib/supabase/server";
import { WF_ERR, workflowErrorMessage } from "@/lib/workflows/errors";
import {
  TRAINING_FIELDS,
  TRAINING_REASON_REQUIRED,
  attendanceUpdatesSchema,
  createTrainingSchema,
  expenseSchema,
  fieldErrorsFrom,
  optReason,
  reason,
  sessionSchema,
  uuid,
  type TrainingField,
} from "@/lib/workflows/schemas";
import type { Json } from "@/types/database";

const refresh = (trainingId?: string) => {
  revalidatePath("/trainings");
  revalidatePath("/data-quality");
  if (trainingId) revalidatePath(`/trainings/${trainingId}`);
};

const invalid = (e: z.ZodError) => fail("Проверьте поля формы.", fieldErrorsFrom(e));

export async function createTraining(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const parsed = createTrainingSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);
  const res = await callRpc("create_training", { p: parsed.data as unknown as Json });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Тренинг создан.", data: { id: res.data as string } };
}

/** Inline-редактирование одного поля тренинга. Для status/часов/дат причина обязательна. */
export async function updateTrainingField(input: { id: string; field: string; value: unknown; reason?: string | null }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const id = uuid.safeParse(input.id);
  if (!id.success) return fail(WF_ERR.notFound);
  if (!(input.field in TRAINING_FIELDS)) return fail("Это поле нельзя изменить здесь.");
  const field = input.field as TrainingField;
  const parsed = TRAINING_FIELDS[field].safeParse(input.value);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? WF_ERR.invalid, { value: parsed.error.issues[0]?.message });
  const r = TRAINING_REASON_REQUIRED.includes(field) ? reason.safeParse(input.reason) : optReason.safeParse(input.reason);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason, { reason: r.error.issues[0]?.message });
  const res = await callRpc("update_training", { p_id: id.data, p_patch: { [field]: parsed.data } as unknown as Json, p_reason: r.data ?? undefined });
  if (!res.ok) return res;
  refresh(id.data);
  return { ok: true, message: "Сохранено.", data: undefined };
}

export async function linkRequest(input: { trainingId: string; requestId: string | null; sourceType?: "PLANNED" | "UNPLANNED" | null; confirm?: boolean; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const p = z
    .object({ trainingId: uuid, requestId: uuid.nullable(), sourceType: z.enum(["PLANNED", "UNPLANNED"]).nullish(), confirm: z.boolean().optional(), reason })
    .safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("link_request", {
    p_training: p.data.trainingId,
    p_request: p.data.requestId as string,
    p_source_type: p.data.sourceType ?? undefined,
    p_confirm: p.data.confirm ?? false,
    p_reason: p.data.reason,
  });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  revalidatePath("/trainings/requests");
  return { ok: true, message: p.data.requestId ? "Заявка привязана." : "Заявка отвязана.", data: undefined };
}

export async function archiveTraining(input: { id: string; archived: boolean; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, archived: z.boolean(), reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("set_training_archived", { p_id: p.data.id, p_archived: p.data.archived, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(p.data.id);
  return { ok: true, message: p.data.archived ? "Тренинг перенесён в архив." : "Тренинг восстановлен.", data: undefined };
}

export async function saveSession(input: { trainingId: string; sessionId?: string | null; values: unknown; reason?: string | null }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const t = uuid.safeParse(input.trainingId);
  const values = sessionSchema.safeParse(input.values);
  if (!t.success) return fail(WF_ERR.notFound);
  if (!values.success) return invalid(values.error);
  const r = optReason.safeParse(input.reason);
  const res = await callRpc("upsert_session", {
    p_training: t.data,
    p_session: (input.sessionId ?? null) as string,
    p: values.data as unknown as Json,
    p_reason: (r.success ? r.data : null) ?? undefined,
  });
  if (!res.ok) return res;
  refresh(t.data);
  return { ok: true, message: "Заход сохранён.", data: undefined };
}

export async function deleteSession(input: { id: string; trainingId: string; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, trainingId: uuid, reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("delete_session", { p_session: p.data.id, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  return { ok: true, message: "Заход удалён.", data: undefined };
}

export async function addParticipants(input: { trainingId: string; employeeIds: string[]; reason?: string | null }): Promise<Result<{ added: number }>> {
  const actor = await requireRole(WF_ROLES.participants);
  if (!actor.ok) return actor;
  const p = z.object({ trainingId: uuid, employeeIds: z.array(uuid).min(1, { message: "Выберите сотрудников" }).max(2000), reason: optReason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid);
  const res = await callRpc("add_participants", { p_training: p.data.trainingId, p_employees: p.data.employeeIds, p_reason: p.data.reason ?? undefined });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  const added = Number(res.data);
  return { ok: true, message: added === 0 ? "Новых участников нет: все выбранные уже в списке." : `Добавлено участников: ${added}.`, data: { added } };
}

export async function addParticipantsByUnit(input: { trainingId: string; orgUnitId: number; reason?: string | null }): Promise<Result<{ added: number }>> {
  const actor = await requireRole(WF_ROLES.participants);
  if (!actor.ok) return actor;
  const p = z.object({ trainingId: uuid, orgUnitId: z.coerce.number().int().positive({ message: "Выберите подразделение" }), reason: optReason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid);
  const res = await callRpc("add_participants_by_unit", { p_training: p.data.trainingId, p_org_unit: p.data.orgUnitId, p_reason: p.data.reason ?? undefined });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  const added = Number(res.data);
  return { ok: true, message: added === 0 ? "В подразделении нет новых активных сотрудников." : `Добавлено участников: ${added}.`, data: { added } };
}

export async function removeParticipant(input: { id: string; trainingId: string; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.participants);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, trainingId: uuid, reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("remove_participant", { p_participant: p.data.id, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  return { ok: true, message: "Участник удалён из списка.", data: undefined };
}

export async function saveAttendance(input: { trainingId: string; updates: unknown; reason: string }): Promise<Result<{ changed: number }>> {
  const actor = await requireRole(WF_ROLES.attendance);
  if (!actor.ok) return actor;
  const upd = attendanceUpdatesSchema.safeParse(input.updates);
  const r = reason.safeParse(input.reason);
  const t = uuid.safeParse(input.trainingId);
  if (!t.success) return fail(WF_ERR.notFound);
  if (!upd.success) return fail(upd.error.issues[0]?.message ?? WF_ERR.invalid);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason, { reason: r.error.issues[0]?.message });
  const res = await callRpc("set_attendance", { p_updates: upd.data as unknown as Json, p_reason: r.data });
  if (!res.ok) return res;
  refresh(t.data);
  return { ok: true, message: "Посещаемость сохранена.", data: { changed: Number(res.data) } };
}

export async function addExpense(input: { trainingId: string; values: unknown; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.expense);
  if (!actor.ok) return actor;
  const t = uuid.safeParse(input.trainingId);
  const v = expenseSchema.safeParse(input.values);
  const r = reason.safeParse(input.reason);
  if (!t.success) return fail(WF_ERR.notFound);
  if (!v.success) return invalid(v.error);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason, { reason: r.error.issues[0]?.message });
  const res = await callRpc("add_expense", {
    p_training: t.data,
    p_category: v.data.category_id,
    p_amount: v.data.amount,
    p_currency: v.data.currency,
    p_date: v.data.operation_date,
    p_comment: v.data.comment ?? "",
    p_reason: r.data,
  });
  if (!res.ok) return res;
  refresh(t.data);
  return { ok: true, message: "Расход добавлен.", data: undefined };
}

export async function updateExpense(input: { id: string; trainingId: string; values: unknown; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.expense);
  if (!actor.ok) return actor;
  const id = uuid.safeParse(input.id);
  const t = uuid.safeParse(input.trainingId);
  const v = expenseSchema.safeParse(input.values);
  const r = reason.safeParse(input.reason);
  if (!id.success || !t.success) return fail(WF_ERR.notFound);
  if (!v.success) return invalid(v.error);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason, { reason: r.error.issues[0]?.message });
  const res = await callRpc("update_expense", { p_id: id.data, p_patch: v.data as unknown as Json, p_reason: r.data });
  if (!res.ok) return res;
  refresh(t.data);
  return { ok: true, message: "Расход изменён. Сумма в TJS пересчитана базой.", data: undefined };
}

/** Сторно: только ADMIN и FINANCE (void_expense проверяет роль в БД). */
export async function voidExpense(input: { id: string; trainingId: string; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.expenseVoid);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, trainingId: uuid, reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("void_expense", { p_id: p.data.id, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  return { ok: true, message: "Операция сторнирована.", data: undefined };
}

/** Откат одной записи аудита (↶). Причина обязательна, откат сам попадает в аудит. */
export async function revertChange(input: { auditId: number; entityPath?: string; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.revert);
  if (!actor.ok) return actor;
  const p = z.object({ auditId: z.coerce.number().int().positive(), reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("revert_change", { p_audit_id: p.data.auditId, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh();
  if (input.entityPath?.startsWith("/")) revalidatePath(input.entityPath);
  return { ok: true, message: "Изменение отменено.", data: undefined };
}

export type EmployeeOption = { id: string; full_name: string; position: string | null; unit: string | null };

/** Поиск сотрудников для выбора участников (до 20 строк). */
export async function searchEmployees(query: string): Promise<EmployeeOption[]> {
  const actor = await requireRole(WF_ROLES.participants);
  if (!actor.ok) return [];
  const q = query.trim().replace(/[%_,()]/g, " ").slice(0, 60);
  try {
    const supabase = await createClient();
    let req = supabase.from("employees").select("id, full_name, position, unit:org_units!employees_unit_id_fkey(name)").eq("is_active", true).order("full_name").limit(20);
    if (q) req = req.ilike("full_name", `%${q}%`);
    const { data, error } = await req;
    if (error) {
      console.error("[workflow] searchEmployees", workflowErrorMessage(error));
      return [];
    }
    return (data ?? []).map((e) => ({ id: e.id, full_name: e.full_name, position: e.position, unit: (e.unit as { name: string } | null)?.name ?? null }));
  } catch {
    return [];
  }
}

