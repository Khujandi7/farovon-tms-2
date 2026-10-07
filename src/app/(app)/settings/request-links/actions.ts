"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { fieldErrorsFrom, reason, uuid } from "@/lib/workflows/schemas";
import type { Json } from "@/types/database";

const refresh = () => revalidatePath("/settings/request-links");

const createSchema = z.object({
  label: z.string().trim().min(2, { message: "Укажите название ссылки" }).max(120, { message: "Не длиннее 120 символов" }),
  org_unit_id: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : Number(v)), z.number().int().positive().nullable()),
  expires_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Дата в формате ГГГГ-ММ-ДД" })
    .nullish()
    .transform((v) => v || null),
  reason,
});

export async function createRequestLink(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.requestLinks);
  if (!actor.ok) return actor;
  const p = createSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const { reason: why, ...rest } = p.data;
  const res = await callRpc("create_request_link", { p: { label: rest.label, org_unit_id: rest.org_unit_id, expires_at: rest.expires_at ? `${rest.expires_at}T23:59:59Z` : null } as Json, p_reason: why });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Ссылка создана.", data: { id: res.data as string } };
}

export async function setRequestLinkActive(input: { id: string; active: boolean; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.requestLinks);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, active: z.boolean(), reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("set_request_link_active", { p_id: p.data.id, p_active: p.data.active, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: p.data.active ? "Ссылка включена." : "Ссылка отключена: новые заявки по ней не принимаются.", data: undefined };
}

export async function regenerateRequestLink(input: { id: string; reason: string }): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.requestLinks);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("regenerate_request_link", { p_id: p.data.id, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: "Создана новая ссылка. Старая больше не работает.", data: { id: res.data as string } };
}

export async function setPublicRequestOpen(input: { open: boolean; reason: string }): Promise<Result> {
  const actor = await requireRole(WF_ROLES.requestLinks);
  if (!actor.ok) return actor;
  const p = z.object({ open: z.boolean(), reason }).safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("set_public_request_open", { p_open: p.data.open, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh();
  return { ok: true, message: p.data.open ? "Общая форма открыта." : "Общая форма закрыта.", data: undefined };
}
