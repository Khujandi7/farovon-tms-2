"use server";

import { revalidatePath } from "next/cache";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { getReestrSheetId } from "@/lib/env.server";
import { getSheetValues, googleConfigured } from "@/lib/google/sheets.server";
import { REESTR_TABS, buildPayload } from "@/lib/reestr/parse";
import type { Json } from "@/types/database";

export type ReestrSyncReport = {
  new_trainings: { id: number; code: string; title: string }[];
  changed: { id: number; field: string; sheet: string; tms: string }[];
  ambiguous: { training: number; name: string; candidates: number }[];
  warnings: { id: number; text: string }[];
  added_participants: number;
  created_external: number;
  added_expenses: number;
  new_trainers: number;
};

/**
 * «Синхронизировать сейчас»: читает три листа Реестра (сервисный аккаунт Google, только чтение) и вызывает reestr_sync в БД.
 * Добавляет новое; существующее не перезаписывает (расхождения возвращает списком); ничего не удаляет. Повторный запуск безопасен.
 */
export async function syncReestr(): Promise<Result<ReestrSyncReport>> {
  const actor = await requireRole(WF_ROLES.training);
  if (!actor.ok) return actor;
  if (!googleConfigured().configured) return fail("Доступ к Google Sheets не настроен: администратору нужно задать ключ сервисного аккаунта Google на сервере (см. docs/DEPLOYMENT.md).");
  const id = getReestrSheetId();
  const [tr, pa, ex] = await Promise.all([getSheetValues(id, REESTR_TABS.trainings), getSheetValues(id, REESTR_TABS.participants), getSheetValues(id, REESTR_TABS.expenses)]);
  if (!tr.ok) return fail(tr.error);
  if (!pa.ok) return fail(pa.error);
  if (!ex.ok) return fail(ex.error);
  const payload = buildPayload(tr.data, pa.data, ex.data);
  if (payload.trainings.length === 0) return fail("В листе тренингов не найдено ни одной строки. Проверьте названия листов и заголовки.");
  const res = await callRpc("reestr_sync", { p: payload as unknown as Json });
  if (!res.ok) return res;
  revalidatePath("/trainings");
  revalidatePath("/data-quality");
  revalidatePath("/dashboard");
  const r = res.data as unknown as ReestrSyncReport;
  return { ok: true, message: "Синхронизация выполнена.", data: r };
}
