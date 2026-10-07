"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { eventTypeSchema, fieldErrorsFrom, optReason, providerSchema, reason } from "@/lib/workflows/schemas";
import type { Json } from "@/types/database";

const refresh = () => {
  revalidatePath("/settings/references");
  revalidatePath("/trainings");
  revalidatePath("/employees");
};
const idNum = z.coerce.number().int().positive();
const orgOpt = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), idNum.nullable());

/* ---------- Подразделения: всегда по id; структура меняется только через RPC ---------- */

const createSchema = z.object({ name: z.string().trim().min(2, { message: "Введите название" }).max(200), parentId: orgOpt, reason: optReason });

export async function createOrgUnit(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.orgUnits);
  if (!actor.ok) return actor;
  const p = createSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  const res = await callRpc("create_org_unit", { p: { name: p.data.name, parent_id: p.data.parentId } as unknown as Json, p_reason: p.data.reason ?? undefined });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: p.data.parentId ? "Отдел добавлен." : "Департамент добавлен.", data: undefined };
}

/** Переименование: прежнее название остаётся псевдонимом, чтобы импорт по старому названию находил подразделение. */
export async function renameOrgUnit(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.orgUnits);
  if (!actor.ok) return actor;
  const p = z.object({ id: idNum, name: z.string().trim().min(2, { message: "Введите название" }).max(200), reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("rename_org_unit", { p_id: p.data.id, p_name: p.data.name, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Подразделение переименовано. Прежнее название сохранено как псевдоним.", data: undefined };
}

export async function moveOrgUnit(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.orgUnits);
  if (!actor.ok) return actor;
  const p = z.object({ id: idNum, newParent: idNum, reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Выберите новый департамент.", fieldErrorsFrom(p.error));
  const res = await callRpc("move_org_unit", { p_id: p.data.id, p_new_parent: p.data.newParent, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Отдел перемещён. Сотрудникам отдела обновлён департамент.", data: undefined };
}

/** Деактивация/восстановление. Департамент с действующими отделами база не даёт деактивировать — её сообщение показывается как есть. */
export async function setOrgUnitActive(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.orgUnits);
  if (!actor.ok) return actor;
  const p = z.object({ id: idNum, active: z.boolean(), reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("set_org_unit_active", { p_id: p.data.id, p_active: p.data.active, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: p.data.active ? "Подразделение восстановлено." : "Подразделение деактивировано.", data: undefined };
}

/* ---------- Типы мероприятий (только ADMIN) ---------- */

export async function saveEventType(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.eventType);
  if (!actor.ok) return actor;
  const p = eventTypeSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  if (p.data.id === null && !p.data.code) return fail("Укажите код типа.", { code: "Укажите код типа" });
  const { id, ...rest } = p.data;
  const patch: Record<string, unknown> = { name: rest.name };
  if (id === null) patch.code = rest.code;
  if (rest.is_group !== undefined) patch.is_group = rest.is_group;
  if (rest.sort_order !== undefined) patch.sort_order = rest.sort_order;
  if (rest.is_active !== undefined) patch.is_active = rest.is_active;
  const res = await callRpc("upsert_event_type", { p_id: id as unknown as number, p: patch as unknown as Json, p_reason: undefined });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: id === null ? "Тип мероприятия добавлен." : "Тип мероприятия сохранён.", data: undefined };
}

/* ---------- Провайдеры / организаторы (ADMIN, ACADEMY_MANAGER) ---------- */

export async function saveProvider(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.provider);
  if (!actor.ok) return actor;
  const p = providerSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  const { id, ...rest } = p.data;
  const patch: Record<string, unknown> = { name: rest.name, contact: rest.contact, note: rest.note };
  if (rest.kind) patch.kind = rest.kind;
  if (rest.is_active !== undefined) patch.is_active = rest.is_active;
  const res = await callRpc("upsert_provider", { p_id: id as unknown as string, p: patch as unknown as Json, p_reason: undefined });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: id === null ? "Провайдер добавлен." : "Провайдер сохранён.", data: undefined };
}
