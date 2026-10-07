"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { APP_ROLES } from "@/lib/auth/roles";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ERR } from "@/lib/workflows/errors";
import { uuid } from "@/lib/workflows/schemas";

/** ids = null — отметить все видимые уведомления. Какие уведомления доступны роли, решает RPC. */
export async function markNotificationsRead(input: { ids: string[] | null }): Promise<Result<{ count: number }>> {
  const actor = await requireRole(APP_ROLES);
  if (!actor.ok) return actor;
  const p = z.object({ ids: z.array(uuid).max(500).nullable() }).safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid);
  const res = await callRpc("mark_notifications_read", { p_ids: p.data.ids as unknown as string[] });
  if (!res.ok) return res;
  revalidatePath("/", "layout");
  return { ok: true, data: { count: Number(res.data) || 0 } };
}
