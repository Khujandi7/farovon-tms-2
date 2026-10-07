"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { fieldErrorsFrom, optReason } from "@/lib/workflows/schemas";

export async function runDqScan(): Promise<Result<{ opened: number; autoFixed: number; totalOpen: number }>> {
  const actor = await requireRole(WF_ROLES.dq);
  if (!actor.ok) return actor;
  const res = await callRpc("dq_scan", {});
  if (!res.ok) return res;
  // Сквозные правила жизненного цикла (M21) пишут в те же dq_issues; итог берём из второго прохода.
  const life = await callRpc("dq_scan_lifecycle", {});
  const base = Array.isArray(res.data) ? res.data[0] : undefined;
  const extra = life.ok && Array.isArray(life.data) ? life.data[0] : undefined;
  const row = base && extra ? { opened: base.opened + extra.opened, auto_fixed: base.auto_fixed + extra.auto_fixed, total_open: extra.total_open } : base;
  revalidatePath("/data-quality");
  return {
    ok: true,
    message: "Проверка выполнена.",
    data: { opened: row?.opened ?? 0, autoFixed: row?.auto_fixed ?? 0, totalOpen: row?.total_open ?? 0 },
  };
}

const resolveSchema = z.object({ id: z.coerce.number().int().positive(), action: z.enum(["IN_REVIEW", "CONFIRM_OK", "IGNORE", "REOPEN"]), reason: optReason });

/** «Оставить на проверке» / «Подтвердить как есть» / «Игнорировать» / «Открыть снова». Для двух последних причина обязательна (проверяет БД). */
export async function resolveDqIssue(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.dq);
  if (!actor.ok) return actor;
  const p = resolveSchema.safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid, fieldErrorsFrom(p.error));
  const res = await callRpc("dq_resolve", { p_issue: p.data.id, p_action: p.data.action, p_reason: p.data.reason ?? undefined });
  if (!res.ok) return res;
  revalidatePath("/data-quality");
  return { ok: true, message: "Решение сохранено.", data: undefined };
}
