// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
const sourceRow = { id: "11111111-1111-4111-8111-111111111111", name: "Кадры", spreadsheet_url: "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit", sheet_name: "Лист1", header_row: null, mapping: { full_name: "ФИО", employee_code: "Таб. №" }, is_active: true };
const from = vi.fn(() => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: sourceRow, error: null }) }) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ rpc, from })) }));
vi.mock("@/lib/auth/session", () => ({ getSession: (...a: unknown[]) => getSession(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const getSheetValues = vi.fn();
const getSpreadsheetMeta = vi.fn();
vi.mock("@/lib/google/sheets.server", () => ({
  getSheetValues: (...a: unknown[]) => getSheetValues(...a),
  getSpreadsheetMeta: (...a: unknown[]) => getSpreadsheetMeta(...a),
  googleConfigured: () => ({ configured: true, serviceAccountEmail: "tms@x.iam.gserviceaccount.com" }),
}));

import { inspectGoogleSheet, readGoogleSheet, saveGoogleSource, syncGoogleSource } from "./google-actions";

const as = (role: string) => getSession.mockResolvedValue({ status: "ok", role, userId: "u1" });
const META = { ok: true, data: { title: "Кадры", tabs: [{ sheetId: 0, title: "Лист1", rows: 100, columns: 5 }, { sheetId: 77, title: "Уволенные", rows: 10, columns: 5 }] } };
const SHEET = [["Выгрузка"], [], ["Таб. №", "ФИО", "Должность"], ["T-1", "Алиев Рустам", "Мастер"], ["T-2", "Бобоев Сухроб", "Оператор"]];
const URL_ = "https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=77";

describe("Google Sheets: действия импорта", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    as("HR");
    getSpreadsheetMeta.mockResolvedValue(META);
    getSheetValues.mockResolvedValue({ ok: true, data: SHEET });
  });

  it("FINANCE не синхронизирует сотрудников и не сохраняет источник; VIEWER не читает таблицы", async () => {
    as("FINANCE");
    expect((await syncGoogleSource({ id: sourceRow.id })).ok).toBe(false);
    expect((await saveGoogleSource({ url: URL_, tab: "Лист1", name: "x", mapping: {}, headers: [] })).ok).toBe(false);
    as("VIEWER");
    expect((await inspectGoogleSheet({ url: URL_ })).ok).toBe(false);
    expect(getSpreadsheetMeta).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("подключение: лист по gid из ссылки; чужая ссылка не уходит в Google", async () => {
    const r = await inspectGoogleSheet({ url: URL_ });
    expect(r).toMatchObject({ ok: true, data: { title: "Кадры", gidTab: "Уволенные", spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" } });
    getSpreadsheetMeta.mockClear();
    expect((await inspectGoogleSheet({ url: "https://evil.example.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" })).ok).toBe(false);
    expect(getSpreadsheetMeta).not.toHaveBeenCalled();
  });

  it("предпросмотр: строка заголовков найдена автоматически, источник GSHEET", async () => {
    const r = await readGoogleSheet({ url: URL_, tab: "Лист1", entity: "EMPLOYEES" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.headerRow).toBe(3);
    expect(r.data.table).toMatchObject({ source: "GSHEET", headers: ["Таб. №", "ФИО", "Должность"], fileName: "Google Sheets: Кадры / Лист1" });
    expect(r.data.table.rows.map((x) => x.rowNo)).toEqual([4, 5]);
  });

  const JOB = "22222222-2222-4222-8222-222222222222";
  /** Ответы пакетного конвейера (M23): begin → append → finish → import_commit_batch. */
  const pipeline = (name: string, commit: () => unknown) => {
    if (name === "import_stage_begin" || name === "import_stage_finish") return { data: JOB, error: null };
    if (name === "import_stage_append") return { data: { received: 2, expected: 2 }, error: null };
    if (name === "import_commit_batch") return { data: commit(), error: null };
    return null;
  };

  it("Sync now без строк на проверку: пакетный dry run → пакетное применение → итог; строки собраны на сервере", async () => {
    rpc.mockImplementation(async (name: string) => {
      const p = pipeline(name, () => ({ status: "COMMITTED", remaining: 0, total: 2, inserted: 2, updated: 0, skipped: 0, apply_errors: 0 }));
      if (p) return p;
      if (name === "record_source_sync") return { data: { status: rpc.mock.calls.some((c) => c[0] === "import_commit_batch") ? "SUCCESS" : "STAGED", created: 2, updated: 0, unchanged: 0, missing: 0 }, error: null };
      return { data: null, error: null };
    });
    const r = await syncGoogleSource({ id: sourceRow.id });
    expect(r).toMatchObject({ ok: true, data: { status: "SUCCESS", stats: { created: 2 } } });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["import_stage_begin", "import_stage_append", "import_stage_finish", "record_source_sync", "import_commit_batch", "record_source_sync"]);
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_entity: "EMPLOYEES", p_source: "GSHEET", p_options: { source_id: sourceRow.id }, p_total: 2 });
    expect(rpc.mock.calls[1]![1].p_rows[0]).toMatchObject({ row_no: 4, data: { full_name: "Алиев Рустам", employee_code: "T-1" } });
    expect(rpc.mock.calls[4]![1]).toMatchObject({ p_job: JOB, p_limit: 120, p_reason: expect.stringContaining("Синхронизация Google Sheets") });
  });

  it("Sync now со строками на проверку: не применяет, ведёт к решениям", async () => {
    rpc.mockImplementation(async (name: string) => {
      const p = pipeline(name, () => ({}));
      if (p) return p;
      if (name === "record_source_sync") return { data: { status: "NEEDS_REVIEW", review: 1 }, error: null };
      return { data: null, error: null };
    });
    const r = await syncGoogleSource({ id: sourceRow.id });
    expect(r).toMatchObject({ ok: true, data: { status: "NEEDS_REVIEW" } });
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("import_commit_batch");
  });

  it("большая таблица не уложилась в бюджет: импорт не объявлен завершённым, итог источника не записан", async () => {
    rpc.mockImplementation(async (name: string) => {
      const p = pipeline(name, () => ({ status: "COMMITTING", remaining: 1000, total: 2646, inserted: 1646, updated: 0, skipped: 0, apply_errors: 0 }));
      if (p) return p;
      if (name === "record_source_sync") return { data: { status: "STAGED" }, error: null };
      return { data: null, error: null };
    });
    const r = await syncGoogleSource({ id: sourceRow.id });
    expect(r).toMatchObject({ ok: true, data: { status: "COMMITTING" }, message: expect.stringContaining("Продолжить применение") });
    expect(rpc.mock.calls.filter((c) => c[0] === "record_source_sync")).toHaveLength(1); // только после dry run
  });

  it("сбой пакета применения: понятная ошибка, повтор безопасен", async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name === "import_commit_batch") return { data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } };
      const p = pipeline(name, () => ({}));
      if (p) return p;
      if (name === "record_source_sync") return { data: { status: "STAGED" }, error: null };
      return { data: null, error: null };
    });
    const r = await syncGoogleSource({ id: sourceRow.id });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("Продолжить применение") });
  });

  it("колонка пропала из таблицы: синхронизация останавливается, ошибка записана в источник", async () => {
    getSheetValues.mockResolvedValue({ ok: true, data: [["Сотрудник", "Должность"], ["Алиев", "Мастер"]] });
    rpc.mockResolvedValue({ data: { status: "FAILED" }, error: null });
    const r = await syncGoogleSource({ id: sourceRow.id });
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("ФИО") });
    expect(rpc).toHaveBeenCalledWith("record_source_sync", expect.objectContaining({ p_source: sourceRow.id, p_error: expect.stringContaining("ФИО") }));
    expect(rpc.mock.calls.map((c) => c[0])).not.toContain("import_stage_begin");
  });

  it("сохранение источника хранит соответствие по названиям колонок", async () => {
    rpc.mockResolvedValue({ data: "33333333-3333-4333-8333-333333333333", error: null });
    const r = await saveGoogleSource({ url: URL_, tab: "Лист1", name: "Кадры", headerRow: 3, mapping: { full_name: 1, employee_code: 0, position: null }, headers: ["Таб. №", "ФИО", "Должность"] });
    expect(r.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("save_import_source", { p: expect.objectContaining({ sheet_name: "Лист1", header_row: 3, mapping: { full_name: "ФИО", employee_code: "Таб. №" }, spreadsheet_id: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789" }) });
    rpc.mockClear();
    expect((await saveGoogleSource({ url: URL_, tab: "Лист1", name: "Кадры", mapping: { position: 2 }, headers: ["a", "b", "c"] })).ok).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
