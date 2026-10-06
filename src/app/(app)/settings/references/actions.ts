"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR, workflowErrorMessage } from "@/lib/workflows/errors";
import { fieldErrorsFrom } from "@/lib/workflows/schemas";

const createSchema = z.object({
  name: z.string().trim().min(2, { message: "Введите название" }).max(200),
  parentId: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().positive().nullable()),
});

/** Справочник подразделений: департамент (без родителя) или отдел (с родителем). Запись под RLS, изменения идут в аудит. */
export async function createOrgUnit(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.references);
  if (!actor.ok) return actor;
  const p = createSchema.safeParse(input);
  if (!p.success) return fail("Проверьте поля формы.", fieldErrorsFrom(p.error));
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("org_units").insert({ name: p.data.name, parent_id: p.data.parentId, level: p.data.parentId ? "UNIT" : "DEPARTMENT" });
    if (error) return fail(workflowErrorMessage(error));
    revalidatePath("/settings/references");
    return { ok: true, message: "Подразделение добавлено.", data: undefined };
  } catch {
    return fail(WF_ERR.unavailable);
  }
}

const renameSchema = z.object({ id: z.coerce.number().int().positive(), name: z.string().trim().min(2).max(200).optional(), isActive: z.boolean().optional() });

export async function updateOrgUnit(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.references);
  if (!actor.ok) return actor;
  const p = renameSchema.safeParse(input);
  if (!p.success) return fail("Проверьте данные.", fieldErrorsFrom(p.error));
  const patch: { name?: string; is_active?: boolean } = {};
  if (p.data.name !== undefined) patch.name = p.data.name;
  if (p.data.isActive !== undefined) patch.is_active = p.data.isActive;
  if (Object.keys(patch).length === 0) return fail("Нечего сохранять.");
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("org_units").update(patch).eq("id", p.data.id).select("id");
    if (error) return fail(workflowErrorMessage(error));
    if (!data?.length) return fail(WF_ERR.forbidden);
    revalidatePath("/settings/references");
    return { ok: true, message: "Сохранено.", data: undefined };
  } catch {
    return fail(WF_ERR.unavailable);
  }
}
