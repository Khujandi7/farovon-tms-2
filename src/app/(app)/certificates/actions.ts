"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { fieldErrorsFrom } from "@/lib/workflows/schemas";
import type { Json } from "@/types/database";
import { certificateReasonRequired, createCertificateSchema, revokeCertificateSchema, updateCertificateSchema } from "@/lib/certificates/schemas";

const refresh = (employeeId?: string | null) => {
  revalidatePath("/certificates");
  revalidatePath("/exams");
  if (employeeId) revalidatePath(`/employees/${employeeId}`);
};

export async function createCertificate(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.certificate);
  if (!actor.ok) return actor;
  const p = createCertificateSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  const res = await callRpc("create_certificate", { p: p.data as unknown as Json });
  if (!res.ok) return res;
  refresh(p.data.employee_id);
  return { ok: true, message: "Сертификат добавлен.", data: { id: res.data as string } };
}

export async function updateCertificate(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.certificate);
  if (!actor.ok) return actor;
  const p = updateCertificateSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  const supabase = await createClient();
  const { data: cur } = await supabase.from("certificates").select("employee_id, issue_date, expiration_date").eq("id", p.data.id).maybeSingle();
  if (!cur) return fail(WF_ERR.notFound);
  if (certificateReasonRequired(cur, p.data) && (p.data.reason?.length ?? 0) < 3) return fail(WF_ERR.reason, { reason: "Укажите причину изменения дат." });
  const { id, reason, ...patch } = p.data;
  const res = await callRpc("update_certificate", { p_id: id, p_patch: patch as unknown as Json, p_reason: reason ?? undefined });
  if (!res.ok) return res;
  refresh(cur.employee_id);
  return { ok: true, message: "Сертификат обновлён.", data: undefined };
}

/** Отзыв (revoked=true) или возврат действия (revoked=false) — всегда с причиной. */
export async function revokeCertificate(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.certificate);
  if (!actor.ok) return actor;
  const p = revokeCertificateSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.reason, fieldErrorsFrom(p.error));
  const supabase = await createClient();
  const { data: cur } = await supabase.from("certificates").select("employee_id").eq("id", p.data.id).maybeSingle();
  const res = await callRpc("revoke_certificate", { p_id: p.data.id, p_revoked: p.data.revoked, p_reason: p.data.reason });
  if (!res.ok) return res;
  refresh(cur?.employee_id);
  return { ok: true, message: p.data.revoked ? "Сертификат отозван." : "Действие сертификата восстановлено.", data: undefined };
}
