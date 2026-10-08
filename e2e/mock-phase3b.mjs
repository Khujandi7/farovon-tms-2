// Расширение mock Supabase для Phase 3B (источники Google Sheets, синхронизация, выбор участников). ТОЛЬКО для E2E.
// Настоящую логику (идемпотентность, сверка «нет в таблице», атомарность, RLS) проверяет SQL-набор phase3b_tests.sql.
// Здесь — интерфейс, права и передача данных между экранами. Также имитирует Google (токен, метаданные, значения листа).
import { storeFor } from "./mock-phase3.mjs";

export const SHEET_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789";
const SHEET_TITLE = "Сотрудники FAROVON";
export const SHEET_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit#gid=0`;
const SHEET_VALUES = [
  ["Список сотрудников 2026"],
  ["Таб. №", "ФИО", "Должность", "Департамент", "Отдел", "Email"],
  ["F-0001", "Убайдуллоев Азам", "Наставник по ИИ", "Финансовый департамент", "Бухгалтерия", "azam@example.test"],
  ["F-0002", "Алиев Рустам", "Бухгалтер", "Финансовый департамент", "Бухгалтерия", ""],
  ["F-0003", "Бобоев Сухроб", "Аналитик", "Департамент рисков", "", ""],
];

export const PICK_EMPLOYEES = [
  { id: "44444444-4444-4444-8444-444444444444", full_name: "Убайдуллоев Азам", employee_code: "F-0001", position: "Наставник по ИИ", department_id: 1, unit_id: 2 },
  { id: "a0000000-0000-4000-8000-000000000001", full_name: "Алиев Рустам", employee_code: "F-0002", position: "Бухгалтер", department_id: 1, unit_id: 2 },
  { id: "a0000000-0000-4000-8000-000000000002", full_name: "Бобоев Сухроб", employee_code: "F-0003", position: "Аналитик", department_id: 3, unit_id: null },
  { id: "a0000000-0000-4000-8000-000000000003", full_name: "Валиев Фарход", employee_code: "F-0004", position: "Риск-менеджер", department_id: 3, unit_id: 4 },
  { id: "a0000000-0000-4000-8000-000000000004", full_name: "Гафуров Умед", employee_code: "F-0005", position: "Бухгалтер", department_id: 1, unit_id: 2 },
];
const PICK_UNITS = [
  { id: 1, name: "Финансовый департамент", parent_id: null, level: "DEPARTMENT", is_active: true },
  { id: 2, name: "Бухгалтерия", parent_id: 1, level: "UNIT", is_active: true },
  { id: 3, name: "Департамент рисков", parent_id: null, level: "DEPARTMENT", is_active: true },
  { id: 4, name: "Оценка рисков", parent_id: 3, level: "UNIT", is_active: true },
];

const IMPORT_ROLES = ["ADMIN", "ACADEMY_MANAGER", "HR"];
const MANAGE = ["ADMIN", "ACADEMY_MANAGER"];
const ok = (res, body, headers = {}) => { res.writeHead(200, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); return true; };
const pgErr = (res, status, code, message) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ code, message })); return true; };
const eqv = (url, k) => { const v = url.searchParams.get(k); return v && v.startsWith("eq.") ? v.slice(3) : null; };
const uid = (n) => `cccccccc-cccc-4ccc-8ccc-${String(n).padStart(12, "0")}`;

function st(store) {
  if (!store.b3) store.b3 = { sources: [], jobs: [], syncs: 0, created: [], nextSource: 1, nextJob: 1 };
  return store.b3;
}

/** Имитация Google: токен сервисного аккаунта, метаданные таблицы, значения листа. Вызывается до проверки входа пользователя. */
export function handleGoogle(req, res, url) {
  if (url.pathname === "/__google/token") return ok(res, { access_token: "e2e-google-token", expires_in: 3600, token_type: "Bearer" });
  if (!url.pathname.startsWith("/__google/v4/spreadsheets/")) return false;
  if (!(req.headers.authorization ?? "").startsWith("Bearer e2e-google-token")) return pgErr(res, 401, "401", "unauthorized");
  const rest = url.pathname.slice("/__google/v4/spreadsheets/".length).split("/");
  const id = decodeURIComponent(rest[0]);
  if (id !== SHEET_ID) {
    // Таблица, не открытая сервисному аккаунту
    if (id.startsWith("PRIVATE")) return pgErr(res, 403, "403", "The caller does not have permission");
    return pgErr(res, 404, "404", "Requested entity was not found.");
  }
  if (rest[1] === "values") return ok(res, { range: "Сотрудники!A1:BH5050", majorDimension: "ROWS", values: SHEET_VALUES });
  return ok(res, { properties: { title: SHEET_TITLE }, sheets: [{ properties: { sheetId: 0, title: "Сотрудники", gridProperties: { rowCount: 100, columnCount: 6 } } }] });
}

export function handlePhase3b(req, res, url, body, role, sid) {
  if (!url.pathname.startsWith("/rest/v1/")) return false;
  const store = storeFor(sid);
  const s = st(store);
  const path = url.pathname.replace("/rest/v1/", "");
  const canImport = IMPORT_ROLES.includes(role);
  const manage = MANAGE.includes(role);

  if (req.method === "GET") {
    const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const out = (list) => (wantsObject ? (list.length === 1 ? ok(res, list[0]) : pgErr(res, 406, "PGRST116", "The result contains 0 rows")) : ok(res, list, { "content-range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" }));
    switch (path) {
      case "import_sources": return out(canImport ? s.sources : []);
      case "import_jobs": { const id = eqv(url, "id"); return out(canImport ? s.jobs.filter((j) => !id || j.id === id) : []); }
      case "import_job_rows": return out([]);
      case "employees": {
        const sel = (url.searchParams.get("select") ?? "").replace(/\s+/g, "");
        if (sel !== "id,full_name,employee_code,position,department_id,unit_id") return false;
        return out(manage ? PICK_EMPLOYEES : []);
      }
      case "org_units": {
        const sel = (url.searchParams.get("select") ?? "").replace(/\s+/g, "");
        return sel === "id,name,level,parent_id" ? out(PICK_UNITS) : false;
      }
      default: return false;
    }
  }

  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    const denied = () => pgErr(res, 403, "42501", "permission denied");
    switch (name) {
      case "save_import_source": {
        if (!canImport) return denied();
        const p = body.p ?? {};
        if (body.p_id) {
          const src = s.sources.find((x) => x.id === body.p_id);
          if (!src) return pgErr(res, 400, "P0015", "Источник не найден");
          if ("is_active" in p) src.is_active = !!p.is_active;
          return ok(res, src.id);
        }
        if (s.sources.some((x) => x.spreadsheet_id === p.spreadsheet_id && x.sheet_name === p.sheet_name)) return pgErr(res, 400, "P0015", "Этот лист уже сохранён как источник");
        const id = uid(1000 + s.nextSource++);
        s.sources.push({ id, name: p.name, kind: "GSHEET", entity: "EMPLOYEES", spreadsheet_id: p.spreadsheet_id, spreadsheet_url: p.spreadsheet_url, sheet_name: p.sheet_name, header_row: p.header_row ?? null, mapping: p.mapping ?? {}, is_active: true, last_sync_at: null, last_status: "NEVER", last_job_id: null, last_stats: {}, last_error: null, created_at: "2026-10-09T00:00:00Z" });
        return ok(res, id);
      }
      case "import_stage": {
        if (!canImport) return denied();
        const id = uid(2000 + s.nextJob++);
        const rows = Array.isArray(body.p_rows) ? body.p_rows : [];
        const known = new Set(PICK_EMPLOYEES.map((e) => e.employee_code));
        const unchanged = rows.filter((r) => known.has(String(r.data?.employee_code ?? ""))).length;
        s.jobs.push({ id, entity: body.p_entity, source: body.p_source, file_name: body.p_file_name, file_hash: body.p_file_hash, mapping: body.p_mapping, options: body.p_options ?? {}, status: "STAGED", total_rows: rows.length, new_rows: rows.length - unchanged, updated_rows: 0, unchanged_rows: unchanged, duplicate_rows: 0, review_rows: 0, error_rows: 0, inserted: 0, updated: 0, skipped: 0, conflicts: 0, created_at: "2026-10-09T10:00:00Z", created_by: null, committed_at: null, cancelled_at: null, reason: null });
        return ok(res, id);
      }
      case "import_commit": {
        if (!canImport) return denied();
        const j = s.jobs.find((x) => x.id === body.p_job);
        if (!j) return pgErr(res, 400, "P0015", "Импорт не найден");
        j.status = "COMMITTED"; j.inserted = j.new_rows; j.skipped = j.unchanged_rows;
        return ok(res, { inserted: j.inserted, updated: 0, skipped: j.skipped, conflicts: 0 });
      }
      case "record_source_sync": {
        if (!canImport) return denied();
        const src = s.sources.find((x) => x.id === body.p_source);
        if (!src) return pgErr(res, 400, "P0015", "Источник не найден");
        if (body.p_error) { Object.assign(src, { last_status: "FAILED", last_error: body.p_error, last_sync_at: "2026-10-09T10:00:00Z" }); return ok(res, { status: "FAILED" }); }
        const j = s.jobs.find((x) => x.id === body.p_job);
        if (!j) return pgErr(res, 400, "P0015", "Импорт не относится к этому источнику");
        const stats = { rows_read: j.total_rows, created: j.status === "COMMITTED" ? j.inserted : j.new_rows, updated: 0, unchanged: j.unchanged_rows, issues: 0, review: 0, errors: 0, duplicates: 0, missing: 0 };
        Object.assign(src, { last_sync_at: "2026-10-09T10:00:00Z", last_status: j.status === "COMMITTED" ? "SUCCESS" : "STAGED", last_job_id: j.id, last_stats: stats, last_error: null });
        return ok(res, { ...stats, status: src.last_status });
      }
      case "create_training_with_participants": {
        if (!manage) return denied();
        const ids = [...new Set(body.p_employees ?? [])];
        if (ids.some((x) => !PICK_EMPLOYEES.some((e) => e.id === x))) return pgErr(res, 400, "P0015", "Участниками могут быть только активные сотрудники справочника");
        const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
        const p = body.p ?? {};
        store.trainings.push({ id, canonical_id: "TR-2026-88", title: p.title, format: p.format ?? "OFFLINE", kind: p.kind ?? "INTERNAL", status: "PLANNED", source_type: "PLANNED", source_confirmed: true, hours: Number(p.hours ?? 4), start_date: p.start_date, end_date: p.end_date ?? p.start_date, participants: ids.length, man_hours: 0, actual_tjs: 0, archived_at: null, request_id: p.request_id ?? null, location: null, participants_planned: p.participants_planned ?? null, description: p.description ?? null, comment: null, unplanned_reason: null, attendance_mode: false, event_type_id: 1, provider_id: null, organizer: null, result_summary: null, created_by: null, updated_by: null, created_at: "2026-10-09T00:00:00Z", updated_at: "2026-10-09T00:00:00Z" });
        s.created.push({ training_id: id, request_id: p.request_id ?? null, employees: ids, planned: p.participants_planned ?? null });
        return ok(res, id);
      }
      case "create_training": {
        if (!manage) return denied();
        return false;
      }
      default: return false;
    }
  }
  return false;
}

export function phase3bState(sid) { return st(storeFor(sid)); }
