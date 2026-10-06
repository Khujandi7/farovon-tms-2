"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { REQUEST_FIELDS, REQUEST_REASON_REQUIRED, createRequestSchema, fieldErrorsFrom, optReason, reason, uuid, type RequestField } from "@/lib/workflows/schemas";
import type { Json } from "@/types/database";

const refresh = (id?: string) => {
  revalidatePath("/trainings/requests");
  revalidatePath("/data-quality");
  if (id) revalidatePath(`/trainings/requests/${id}`);
};

export async function createRequest(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.request);
  if (!actor.ok) return actor;
  const parsed = createRequestSchema.safeParse(input);
  if (!parsed.success) return fail("Проверьте поля формы.", fieldErrorsFrom(parsed.error));
  const res = await callRpc("create_request", { p: parsed.data as unknown as Json });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Заявка создана. Валюта новых заявок — TJS.", data: { id: res.data as string } };
}

export async function updateRequestField(input: { id: string; field: string; value: unknown; reason?: string | null }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.request);
  if (!actor.ok) return actor;
  const id = uuid.safeParse(input.id);
  if (!id.success) return fail(WF_ERR.notFound);
  if (!(input.field in REQUEST_FIELDS)) return fail("Это поле нельзя изменить здесь.");
  const field = input.field as RequestField;
  const parsed = REQUEST_FIELDS[field].safeParse(input.value);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? WF_ERR.invalid, { value: parsed.error.issues[0]?.message });
  const r = REQUEST_REASON_REQUIRED.includes(field) ? reason.safeParse(input.reason) : optReason.safeParse(input.reason);
  if (!r.success) return fail(r.error.issues[0]?.message ?? WF_ERR.reason, { reason: r.error.issues[0]?.message });
  const res = await callRpc("update_request", { p_id: id.data, p_patch: { [field]: parsed.data } as unknown as Json, p_reason: r.data ?? undefined });
  if (!res.ok) return res;
  refresh(id.data);
  return { ok: true, message: "Сохранено.", data: undefined };
}

export async function archiveRequest(input: { id: string; archived: boolean; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.request);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, archived: z.boolean(), reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("set_request_archived", { p_id: p.data.id, p_archived: p.data.archived, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(p.data.id);
  return { ok: true, message: p.data.archived ? "Заявка перенесена в архив." : "Заявка восстановлена.", data: undefined };
}
