"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { fieldErrorsFrom, optReason, reason, uuid } from "@/lib/workflows/schemas";
import type { Json } from "@/types/database";

/** Действия сквозного жизненного цикла (Phase 3A.2): тренеры, детали заходов, обратная связь, обучение из заявки. Бизнес-правила — в RPC M21. */
const refresh = (trainingId?: string) => {
  revalidatePath("/trainings");
  revalidatePath("/reports");
  revalidatePath("/dashboard");
  revalidatePath("/data-quality");
  if (trainingId) revalidatePath(`/trainings/${trainingId}`);
};
const bad = (e: z.ZodError) => fail(e.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(e));
const opt = (max: number) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null));

export async function assignTrainer(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const p = z.object({ trainingId: uuid, trainerId: uuid, role: z.enum(["PRIMARY", "CO"]), reason: optReason }).safeParse(input);
  if (!p.success) return bad(p.error);
  const res = await callRpc("set_training_trainer", { p_training: p.data.trainingId, p_trainer: p.data.trainerId, p_role: p.data.role, p_reason: p.data.reason ?? undefined });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  return { ok: true, message: "Тренер назначен.", data: undefined };
}

/** Новый тренер в справочнике (дубликаты по нормализованному ФИО отклоняет БД) и, если указано обучение, сразу назначение. */
export async function createTrainer(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const p = z
    .object({
      trainingId: uuid.nullish().transform((v) => v ?? null),
      full_name: z.string().trim().min(2, { message: "Укажите ФИО" }).max(200),
      kind: z.enum(["INTERNAL", "EXTERNAL", "ORGANIZATION"]),
      organization: opt(200),
      role: z.enum(["PRIMARY", "CO"]).default("CO"),
    })
    .safeParse(input);
  if (!p.success) return bad(p.error);
  const created = await callRpc("upsert_trainer", { p: { full_name: p.data.full_name, kind: p.data.kind, organization: p.data.organization } as unknown as Json });
  if (!created.ok) return created;
  const id = created.data as string;
  if (p.data.trainingId) {
    const a = await callRpc("set_training_trainer", { p_training: p.data.trainingId, p_trainer: id, p_role: p.data.role });
    if (!a.ok) return a;
  }
  refresh(p.data.trainingId ?? undefined);
  revalidatePath("/trainers");
  return { ok: true, message: "Тренер добавлен.", data: { id } };
}

export async function removeTrainer(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const p = z.object({ trainingId: uuid, trainerId: uuid, reason }).safeParse(input);
  if (!p.success) return bad(p.error);
  const res = await callRpc("remove_training_trainer", { p_training: p.data.trainingId, p_trainer: p.data.trainerId, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  return { ok: true, message: "Тренер снят.", data: undefined };
}

export async function saveSessionDetails(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const time = z.string().regex(/^\d{2}:\d{2}$/, { message: "Время в формате ЧЧ:ММ" }).nullish().transform((v) => v || null);
  const p = z
    .object({
      trainingId: uuid,
      sessionId: uuid,
      start_time: time,
      end_time: time,
      room: opt(100),
      trainer_id: z.preprocess((v) => (v === "" ? null : v), uuid.nullish()).transform((v) => v ?? null),
      status: z.enum(["PLANNED", "HELD", "CANCELLED"]),
      reason: optReason,
    })
    .safeParse(input);
  if (!p.success) return bad(p.error);
  const { trainingId, sessionId, reason: r, ...patch } = p.data;
  const res = await callRpc("set_session_details", { p_session: sessionId, p: patch as unknown as Json, p_reason: r ?? undefined });
  if (!res.ok) return res;
  refresh(trainingId);
  return { ok: true, message: "Детали захода сохранены.", data: undefined };
}

export async function sendFeedbackInvitations(input: unknown): Promise<Result<{ invited: number }>> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const p = z.object({ trainingId: uuid }).safeParse(input);
  if (!p.success) return bad(p.error);
  const res = await callRpc("send_feedback_invitations", { p_training: p.data.trainingId });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  const n = Number(res.data);
  return { ok: true, message: n > 0 ? `Приглашений отправлено: ${n}.` : "Новых приглашений нет: все участники уже приглашены.", data: { invited: n } };
}

const score = z.coerce.number().int().min(1, { message: "Оценка от 1 до 5" }).max(5, { message: "Оценка от 1 до 5" });
export async function recordFeedback(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const p = z.object({ trainingId: uuid, participantId: uuid, materials: score, trainer: score, org: score, comment: opt(1000) }).safeParse(input);
  if (!p.success) return bad(p.error);
  const scores = { MATERIALS: { "1": p.data.materials }, TRAINER: { "1": p.data.trainer }, ORG: { "1": p.data.org } };
  const res = await callRpc("record_feedback_response", { p_participant: p.data.participantId, p_scores: scores as unknown as Json, p_comment: p.data.comment ?? undefined });
  if (!res.ok) return res;
  refresh(p.data.trainingId);
  return { ok: true, message: "Анкета сохранена.", data: undefined };
}

export async function createTrainingFromRequest(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Укажите дату" });
  const p = z.object({ requestId: uuid, start_date: date, end_date: z.preprocess((v) => (v === "" ? null : v), date.nullish()).transform((v) => v || null), hours: z.coerce.number().positive({ message: "Часы больше 0" }) }).safeParse(input);
  if (!p.success) return bad(p.error);
  const patch: Record<string, unknown> = { start_date: p.data.start_date, hours: p.data.hours };
  if (p.data.end_date) patch.end_date = p.data.end_date;
  const res = await callRpc("create_training_from_request", { p_request: p.data.requestId, p: patch as unknown as Json });
  if (!res.ok) return res;
  refresh();
  revalidatePath(`/trainings/requests/${p.data.requestId}`);
  return { ok: true, message: "Обучение создано из заявки.", data: { id: res.data as string } };
}

export async function saveRequestDetails(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.request);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]), expected_result: opt(1000) }).safeParse(input);
  if (!p.success) return bad(p.error);
  const res = await callRpc("set_request_details", { p_id: p.data.id, p: { priority: p.data.priority, expected_result: p.data.expected_result } as unknown as Json });
  if (!res.ok) return res;
  revalidatePath(`/trainings/requests/${p.data.id}`);
  return { ok: true, message: "Сохранено.", data: undefined };
}
