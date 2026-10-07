"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { EMPLOYEE_FIELDS, fieldErrorsFrom, optReason, reason, uuid, type EmployeeField } from "@/lib/workflows/schemas";
import type { Json } from "@/types/database";

const refresh = (id?: string) => {
  revalidatePath("/employees");
  revalidatePath("/data-quality");
  if (id) revalidatePath(`/employees/${id}`);
};

const createSchema = z.object({
  full_name: EMPLOYEE_FIELDS.full_name,
  position: EMPLOYEE_FIELDS.position,
  department_id: EMPLOYEE_FIELDS.department_id,
  unit_id: EMPLOYEE_FIELDS.unit_id,
});

/** Сотрудники создаются только вручную в справочнике. Из списков участников они не создаются автоматически. */
export async function createEmployee(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.employee);
  if (!actor.ok) return actor;
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы.", fieldErrorsFrom(parsed.error));
  const res = await callRpc("create_employee", { p: parsed.data as unknown as Json });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Сотрудник добавлен в справочник.", data: { id: res.data as string } };
}

export async function updateEmployeeField(input: { id: string; field: string; value: unknown; reason?: string | null }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.employee);
  if (!actor.ok) return actor;
  const id = uuid.safeParse(input.id);
  if (!id.success) return fail(WF_ERR.notFound);
  if (!(input.field in EMPLOYEE_FIELDS)) return fail("Это поле нельзя изменить здесь.");
  const field = input.field as EmployeeField;
  const parsed = EMPLOYEE_FIELDS[field].safeParse(input.value);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? WF_ERR.invalid, { value: parsed.error.issues[0]?.message });
  const r = field === "is_active" ? reason.safeParse(input.reason) : optReason.safeParse(input.reason);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason, { reason: r.error.issues[0]?.message });
  const res = await callRpc("update_employee", { p_id: id.data, p_patch: { [field]: parsed.data } as unknown as Json, p_reason: r.data ?? undefined });
  if (!res.ok) return res;
  refresh(id.data);
  return { ok: true, message: "Сохранено.", data: undefined };
}

export async function addEmployeeAlias(input: { employeeId: string; alias: string; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.employee);
  if (!actor.ok) return actor;
  const p = z.object({ employeeId: uuid, alias: z.string().trim().min(2, { message: "Введите написание" }).max(200), reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("add_employee_alias", { p_employee: p.data.employeeId, p_alias: p.data.alias, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(p.data.employeeId);
  return { ok: true, message: "Написание закреплено за сотрудником.", data: undefined };
}

export async function removeEmployeeAlias(input: { aliasId: number; employeeId: string; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.employee);
  if (!actor.ok) return actor;
  const p = z.object({ aliasId: z.coerce.number().int().positive(), employeeId: uuid, reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("remove_employee_alias", { p_alias: p.data.aliasId, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(p.data.employeeId);
  return { ok: true, message: "Написание удалено.", data: undefined };
}

const BULK_MAX = 500;
const orgId = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().positive().nullable());

const bulkSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("move"), department_id: orgId, unit_id: orgId }),
  z.object({ action: z.literal("position"), position: z.string().trim().max(200, { message: "Не длиннее 200 символов" }) }),
  z.object({ action: z.literal("status"), is_active: z.boolean() }),
]);

/** Массовое изменение сотрудников одним патчем через bulk_update_employees (≤ 500 за раз, причина обязательна, аудит пишет БД). */
export async function bulkUpdateEmployees(input: { ids: unknown; change: unknown; reason: unknown }): Promise<Result<{ count: number }>> {
  const actor = await requireRole(WF_ROLES.employee);
  if (!actor.ok) return actor;
  const ids = z.array(uuid).min(1, { message: "Не выбрано ни одного сотрудника" }).max(BULK_MAX, { message: `Не больше ${BULK_MAX} сотрудников за раз` }).safeParse(input.ids);
  if (!ids.success) return fail(ids.error.issues[0]?.message ?? WF_ERR.invalid);
  const change = bulkSchema.safeParse(input.change);
  if (!change.success) return fail(change.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(change.error));
  const r = reason.safeParse(input.reason);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason, { reason: r.error.issues[0]?.message });

  const c = change.data;
  let patch: Record<string, Json>;
  if (c.action === "move") {
    if (!c.department_id && !c.unit_id) return fail("Выберите департамент или отдел.");
    // Отдел без департамента: департамент БД возьмёт из родителя отдела. Департамент без отдела сбрасывает отдел.
    patch = c.unit_id ? { unit_id: c.unit_id, ...(c.department_id ? { department_id: c.department_id } : {}) } : { department_id: c.department_id, unit_id: null };
  } else if (c.action === "position") {
    patch = { position: c.position === "" ? null : c.position };
  } else {
    patch = { is_active: c.is_active };
  }
  const res = await callRpc("bulk_update_employees", { p_ids: [...new Set(ids.data)], p_patch: patch as unknown as Json, p_reason: r.data });
  if (!res.ok) return res;
  refresh();
  const count = Number(res.data ?? ids.data.length);
  return { ok: true, message: `Изменено сотрудников: ${count}.`, data: { count } };
}
