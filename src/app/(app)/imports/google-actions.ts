"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { callRpc, fail, requireRole, type Result } from "@/lib/workflows/server";
import { WF_ROLES } from "@/lib/workflows/roles";
import { WF_ERR } from "@/lib/workflows/errors";
import { uuid } from "@/lib/workflows/schemas";
import { createClient } from "@/lib/supabase/server";
import { parseSheetUrl } from "@/lib/google/sheets-url";
import { getSheetValues, getSpreadsheetMeta, googleConfigured, type SheetTab } from "@/lib/google/sheets.server";
import { detectHeaderRow, mappingToNames, namesToMapping, tableWithHeaderAt } from "@/lib/imports/header-detect";
import { buildStageRows } from "@/lib/imports/build";
import { missingRequired, type ColumnMapping } from "@/lib/imports/mapping";
import { MAX_ROWS } from "@/lib/imports/table";
import { sha256Hex } from "@/lib/imports/hash";
import type { ParsedTable } from "@/lib/imports/types";
import type { Json } from "@/types/database";

/**
 * Google Sheets → справочник сотрудников (Phase 3B). Таблица читается ТОЛЬКО на сервере сервисным аккаунтом;
 * дальше — общий конвейер импорта: import_stage (dry run) → решения → import_commit. Синхронизация идемпотентна:
 * сопоставление по табельному номеру → точному ФИО → алиасам, неоднозначное — на ручную проверку.
 */
const urlSchema = z.object({ url: z.string().trim().min(1).max(500) });

export async function googleSheetsStatus(): Promise<Result<{ configured: boolean; serviceAccountEmail: string | null }>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  return { ok: true, data: googleConfigured() };
}

export async function inspectGoogleSheet(input: unknown): Promise<Result<{ spreadsheetId: string; url: string; title: string; tabs: SheetTab[]; gidTab: string | null }>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = urlSchema.safeParse(input);
  if (!p.success) return fail("Вставьте ссылку на Google-таблицу.");
  const parsed = parseSheetUrl(p.data.url);
  if (!parsed.ok) return fail(parsed.error, { url: parsed.error });
  const meta = await getSpreadsheetMeta(parsed.value.spreadsheetId);
  if (!meta.ok) return fail(meta.error);
  if (meta.data.tabs.length === 0) return fail("В таблице нет листов.");
  const gidTab = parsed.value.gid === null ? null : (meta.data.tabs.find((t) => t.sheetId === parsed.value.gid)?.title ?? null);
  return { ok: true, data: { spreadsheetId: parsed.value.spreadsheetId, url: parsed.value.url, title: meta.data.title, tabs: meta.data.tabs, gidTab } };
}

type Loaded = { table: ParsedTable; headerRow: number; top: string[][] };

async function loadTab(url: string, tab: string, headerRow: number | null, entity: "EMPLOYEES" | "PARTICIPANTS" | "LEARNING_EVENTS" | "EXPENSES" | "EXAMS" | "CERTIFICATES"): Promise<Result<Loaded>> {
  const parsed = parseSheetUrl(url);
  if (!parsed.ok) return fail(parsed.error);
  const [meta, values] = await Promise.all([getSpreadsheetMeta(parsed.value.spreadsheetId), getSheetValues(parsed.value.spreadsheetId, tab)]);
  if (!meta.ok) return fail(meta.error);
  if (!values.ok) return fail(values.error);
  const matrix = values.data;
  if (matrix.length === 0) return fail("Лист пуст.");
  const h = headerRow === null ? detectHeaderRow(matrix, entity) : Math.min(Math.max(headerRow - 1, 0), matrix.length - 1);
  const t = tableWithHeaderAt(matrix, h);
  if (t.rows.length === 0) return fail("Под строкой заголовков нет строк с данными.");
  if (t.rows.length > MAX_ROWS) return fail("Не больше 5000 строк за раз. Разбейте лист или отфильтруйте выгрузку.");
  const table: ParsedTable = { ...t, fileName: `Google Sheets: ${meta.data.title} / ${tab}`.slice(0, 200), fileHash: await sha256Hex(JSON.stringify(matrix)), source: "GSHEET" };
  return { ok: true, data: { table, headerRow: h + 1, top: matrix.slice(0, 8).map((r) => r.slice(0, 12)) } };
}

const readSchema = z.object({
  url: z.string().trim().min(1).max(500),
  tab: z.string().min(1).max(100),
  headerRow: z.number().int().min(1).max(50).nullish(),
  entity: z.enum(["EMPLOYEES", "PARTICIPANTS", "LEARNING_EVENTS", "EXPENSES", "EXAMS", "CERTIFICATES"]).default("EMPLOYEES"),
});

/** Предпросмотр листа: таблица, найденная строка заголовков и первые строки «как в листе» для выбора заголовка вручную. */
export async function readGoogleSheet(input: unknown): Promise<Result<Loaded>> {
  const actor = await requireRole(WF_ROLES.importAny);
  if (!actor.ok) return actor;
  const p = readSchema.safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid);
  return loadTab(p.data.url, p.data.tab, p.data.headerRow ?? null, p.data.entity);
}

const saveSchema = z.object({
  url: z.string().trim().min(1).max(500),
  tab: z.string().min(1).max(100),
  name: z.string().trim().min(2, { message: "Назовите источник" }).max(120),
  headerRow: z.number().int().min(1).max(50).nullish(),
  mapping: z.record(z.string().max(40), z.number().int().min(0).max(200).nullable()),
  headers: z.array(z.string().max(200)).max(200),
});

/** Сохранить лист как источник для повторной синхронизации (только справочник сотрудников). */
export async function saveGoogleSource(input: unknown): Promise<Result<{ id: string }>> {
  const actor = await requireRole(WF_ROLES.importEmployees);
  if (!actor.ok) return actor;
  const p = saveSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? WF_ERR.invalid);
  const parsed = parseSheetUrl(p.data.url);
  if (!parsed.ok) return fail(parsed.error);
  if (missingRequired(p.data.mapping as ColumnMapping, "EMPLOYEES").length) return fail("Сопоставьте обязательные колонки перед сохранением источника.");
  const res = await callRpc("save_import_source", {
    p: { name: p.data.name, spreadsheet_id: parsed.value.spreadsheetId, spreadsheet_url: parsed.value.url, sheet_name: p.data.tab, header_row: p.data.headerRow ?? null, mapping: mappingToNames(p.data.mapping as ColumnMapping, p.data.headers) } as unknown as Json,
  });
  if (!res.ok) return res;
  revalidatePath("/employees/import");
  return { ok: true, message: "Источник сохранён.", data: { id: res.data as string } };
}

export type SyncOutcome = { jobId: string | null; status: string; stats: Record<string, number> };

/**
 * «Синхронизировать сейчас»: чтение листа → dry run (import_stage) → если ничего не требует решения человека — применение
 * (import_commit) → итог и сверка «кого нет в таблице» (record_source_sync). Если есть строки на проверку — остановка:
 * решения принимаются на странице импорта, применение там же. Ничего не удаляется.
 */
export async function syncGoogleSource(input: unknown): Promise<Result<SyncOutcome>> {
  const actor = await requireRole(WF_ROLES.importEmployees);
  if (!actor.ok) return actor;
  const id = uuid.safeParse((input as { id?: unknown })?.id);
  if (!id.success) return fail(WF_ERR.notFound);
  const supabase = await createClient();
  const { data: src, error } = await supabase.from("import_sources").select("id, name, spreadsheet_url, sheet_name, header_row, mapping, is_active").eq("id", id.data).maybeSingle();
  if (error || !src) return fail(WF_ERR.notFound);
  if (!src.is_active) return fail("Источник отключён.");
  const failSync = async (message: string) => {
    await callRpc("record_source_sync", { p_source: src.id, p_job: src.id, p_error: message });
    revalidatePath("/employees/import");
    return fail(message);
  };
  const loaded = await loadTab(src.spreadsheet_url, src.sheet_name, src.header_row, "EMPLOYEES");
  if (!loaded.ok) return failSync(loaded.error);
  const { table } = loaded.data;
  const { mapping, lost } = namesToMapping((src.mapping ?? {}) as Record<string, string>, table.headers, "EMPLOYEES");
  const missing = missingRequired(mapping, "EMPLOYEES");
  if (missing.length) return failSync(`В листе нет колонок для: ${missing.join(", ")}${lost.length ? ` (не найдены «${lost.join("», «")}»)` : ""}. Обновите соответствие колонок.`);
  const built = buildStageRows(table, mapping, "EMPLOYEES");
  if (built.rows.length === 0) return failSync("В листе нет строк с данными.");
  const staged = await callRpc("import_stage", {
    p_entity: "EMPLOYEES", p_source: "GSHEET", p_file_name: table.fileName, p_file_hash: table.fileHash,
    p_mapping: mapping as unknown as Json, p_options: { source_id: src.id } as unknown as Json, p_rows: built.rows as unknown as Json,
  });
  if (!staged.ok) return failSync(staged.error);
  const jobId = staged.data as string;
  const first = await callRpc("record_source_sync", { p_source: src.id, p_job: jobId });
  if (!first.ok) return first;
  const firstStats = (first.data ?? {}) as Record<string, number | string>;
  let outcome = firstStats;
  if (firstStats.status !== "NEEDS_REVIEW") {
    const commit = await callRpc("import_commit", { p_job: jobId, p_reason: `Синхронизация Google Sheets: ${src.name}` });
    if (!commit.ok) return failSync(commit.error);
    const done = await callRpc("record_source_sync", { p_source: src.id, p_job: jobId });
    if (!done.ok) return done;
    outcome = (done.data ?? {}) as Record<string, number | string>;
  }
  revalidatePath("/employees/import");
  revalidatePath("/employees");
  revalidatePath("/data-quality");
  revalidatePath(`/imports/${jobId}`);
  const stats = Object.fromEntries(Object.entries(outcome).filter(([, v]) => typeof v === "number")) as Record<string, number>;
  const status = String(outcome.status ?? "");
  const message =
    status === "NEEDS_REVIEW"
      ? `Нужна проверка: ${stats.review ?? 0} строк. Откройте импорт, примите решения и примените.`
      : `Синхронизировано: добавлено ${stats.created ?? 0}, обновлено ${stats.updated ?? 0}, без изменений ${stats.unchanged ?? 0}${stats.missing ? `, нет в таблице ${stats.missing}` : ""}.`;
  return { ok: true, message, data: { jobId, status, stats } };
}

export async function setGoogleSourceActive(input: unknown): Promise<Result> {
  const actor = await requireRole(WF_ROLES.importEmployees);
  if (!actor.ok) return actor;
  const p = z.object({ id: uuid, active: z.boolean() }).safeParse(input);
  if (!p.success) return fail(WF_ERR.invalid);
  const res = await callRpc("save_import_source", { p: { is_active: p.data.active } as unknown as Json, p_id: p.data.id });
  if (!res.ok) return res;
  revalidatePath("/employees/import");
  return { ok: true, message: p.data.active ? "Источник включён." : "Источник отключён.", data: undefined };
}

