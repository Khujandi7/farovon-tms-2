// Расширение mock Supabase для Phase 3 (обучения, заявки, Data Quality, аудит). ТОЛЬКО для E2E.
// Реальную логику (RLS, RPC, аудит) проверяют SQL-тесты; здесь — достаточно, чтобы проверить интерфейс и права.
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";
const T3 = "33333333-3333-4333-8333-333333333333";
const ISSUE_AT = "2026-10-01T10:00:00.000Z";

const base = (id, code, title, o = {}) => ({
  id, canonical_id: code, title, format: "OFFLINE", kind: "TRAINING", status: "COMPLETED", source_type: "PLANNED", source_confirmed: true,
  hours: 8, start_date: "2026-03-10", end_date: "2026-03-11", participants: 4, man_hours: 32, actual_tjs: 1500, archived_at: null, request_id: null,
  location: "Худжанд", participants_planned: 4, description: null, comment: null, unplanned_reason: null, attendance_mode: false,
  created_by: null, updated_by: null, created_at: "2026-09-01T09:00:00Z", updated_at: "2026-09-01T09:00:00Z", ...o,
});

export const store = {
  trainings: [],
  audit: [],
  issues: [],
  nextAudit: 1,
};
export function resetStore() {
  store.trainings = [
    base(T1, "TR-2026-1", "Лидерство для руководителей"),
    base(T2, "TR-2026-2", "Охрана труда", { status: "PLANNED", source_type: "UNPLANNED", source_confirmed: false, start_date: "2026-05-20", end_date: "2026-05-20", hours: 4, participants: 0, man_hours: 0, actual_tjs: 0, format: "ONLINE" }),
    base(T3, "TR-2025-9", "Архивный курс", { archived_at: "2026-01-01T00:00:00Z", start_date: "2025-02-01", end_date: "2025-02-01" }),
  ];
  store.audit = [];
  store.nextAudit = 1;
  store.issues = [
    { id: 1, rule_code: "TRAINING_NO_PARTICIPANTS", severity: "WARNING", entity_table: "trainings", entity_id: T1, message: "У завершённого тренинга нет участников", suggestion: "Добавьте участников", status: "OPEN", details: null, resolution: null, updated_at: ISSUE_AT, created_at: ISSUE_AT },
    { id: 2, rule_code: "SRC_CANDIDATE_UNCONFIRMED", severity: "ERROR", entity_table: "trainings", entity_id: T2, message: "Внеплановый тренинг не подтверждён", suggestion: "Свяжите с заявкой", status: "OPEN", details: null, resolution: null, updated_at: ISSUE_AT, created_at: ISSUE_AT },
  ];
}
resetStore();

const REASON_FIELDS = ["status", "start_date", "end_date", "hours"];

const pgErr = (res, status, code, message) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ code, message })); return true; };
const ok = (res, body, headers = {}) => { res.writeHead(200, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); return true; };

const param = (url, k) => url.searchParams.get(k);
const match = (v, cond) => {
  if (cond === undefined || cond === null) return true;
  if (cond.startsWith("eq.")) return String(v) === cond.slice(3);
  if (cond === "is.null") return v === null || v === undefined;
  if (cond === "not.is.null") return v !== null && v !== undefined;
  if (cond.startsWith("gte.")) return String(v) >= cond.slice(4);
  if (cond.startsWith("lte.")) return String(v) <= cond.slice(4);
  if (cond.startsWith("in.")) return cond.slice(4, -1).split(",").includes(String(v));
  return true;
};
function filterRows(rows, url, cols) {
  let out = rows.filter((r) => cols.every((c) => match(r[c], param(url, c))));
  // фильтры по дате: gte и lte приходят как два параметра одного столбца
  const all = url.searchParams.getAll("start_date");
  for (const c of all) out = out.filter((r) => match(r.start_date, c));
  const or = param(url, "or");
  if (or) {
    const m = or.match(/title\.ilike\.%(.*)%,canonical_id/);
    const q = (m?.[1] ?? "").toLowerCase();
    out = out.filter((r) => r.title.toLowerCase().includes(q) || r.canonical_id.toLowerCase().includes(q));
  }
  return out;
}

function rowsResponse(req, res, url, rows) {
  const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
  const total = rows.length;
  const limit = Number(param(url, "limit") ?? 1000);
  const offset = Number(param(url, "offset") ?? 0);
  const page = rows.slice(offset, offset + limit);
  if (wantsObject) return page.length === 1 ? ok(res, page[0]) : pgErr(res, 406, "PGRST116", "The result contains 0 rows");
  const range = page.length ? `${offset}-${offset + page.length - 1}/${total}` : `*/${total}`;
  return ok(res, page, { "content-range": range });
}

const sortRows = (rows) => [...rows].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)) || b.canonical_id.localeCompare(a.canonical_id));

function addAudit(userId, userName, table, rowId, action, oldRow, newRow, reason) {
  const changes = {};
  for (const k of Object.keys(newRow ?? {})) if (oldRow?.[k] !== newRow[k]) changes[k] = { old: oldRow?.[k] ?? null, new: newRow[k] };
  store.audit.unshift({ id: store.nextAudit++, at: new Date().toISOString(), user_id: userId, user_name: userName, table_name: table, row_id: rowId, action, reason: reason ?? null, old_row: oldRow, new_row: newRow, changes });
}

/** Возвращает true, если запрос обработан. */
export function handlePhase3(req, res, url, body, role, user) {
  const path = url.pathname.replace("/rest/v1/", "");

  // ---- служебное ----
  if (url.pathname === "/__mock/reset") { resetStore(); return ok(res, { ok: true }); }
  if (url.pathname === "/__mock/audit") return ok(res, store.audit);
  if (!url.pathname.startsWith("/rest/v1/")) return false;

  // ---- чтение ----
  if (req.method === "GET") {
    if (path === "v_training_list") {
      const rows = sortRows(filterRows(store.trainings, url, ["id", "status", "source_type", "archived_at", "request_id"]));
      return rowsResponse(req, res, url, rows);
    }
    if (path === "trainings" && param(url, "id")) {
      return rowsResponse(req, res, url, filterRows(store.trainings, url, ["id", "archived_at"]));
    }
    if (path === "dq_issues") {
      let rows = store.issues;
      const st = param(url, "status");
      if (st?.startsWith("in.")) rows = rows.filter((r) => match(r.status, st));
      else if (st) rows = rows.filter((r) => match(r.status, st));
      const rule = param(url, "rule_code");
      if (rule) rows = rows.filter((r) => match(r.rule_code, rule));
      return rowsResponse(req, res, url, rows);
    }
    if (["training_requests", "training_sessions", "training_participants", "session_attendance", "expense_operations", "expense_categories", "source_records", "org_units", "employees", "employee_aliases", "profiles"].includes(path) && path !== "profiles") {
      return rowsResponse(req, res, url, []);
    }
    if (path === "trainings") return false; // дашборд — прежний ответ
  }

  // ---- RPC ----
  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    const canTrain = role === "ADMIN" || role === "ACADEMY_MANAGER";
    if (name === "cost_per_participant") return ok(res, 375);
    if (name === "entity_audit") {
      const rows = store.audit.filter((a) => a.table_name === body.p_table && a.row_id === body.p_id);
      return ok(res, rows.slice(0, body.p_limit ?? 100));
    }
    if (name === "dq_scan") return ok(res, null);
    if (name === "dq_resolve") {
      if (!canTrain) return pgErr(res, 403, "42501", "permission denied");
      const issue = store.issues.find((i) => i.id === body.p_issue);
      if (!issue) return pgErr(res, 400, "P0001", "Замечание не найдено");
      if (["CONFIRM_OK", "IGNORE"].includes(body.p_action) && !(body.p_reason ?? "").trim()) return pgErr(res, 400, "P0012", "Укажите причину");
      issue.status = { IN_REVIEW: "IN_REVIEW", CONFIRM_OK: "CONFIRMED", IGNORE: "IGNORED", REOPEN: "OPEN" }[body.p_action] ?? issue.status;
      issue.resolution = body.p_reason ?? null;
      return ok(res, null);
    }
    if (name === "update_training") {
      if (!canTrain) return pgErr(res, 403, "42501", "permission denied");
      const t = store.trainings.find((x) => x.id === body.p_id);
      if (!t) return pgErr(res, 400, "P0001", "Тренинг не найден");
      const patch = body.p_patch ?? {};
      const needs = Object.keys(patch).some((k) => REASON_FIELDS.includes(k));
      if (needs && !(body.p_reason ?? "").trim()) return pgErr(res, 400, "P0012", "Укажите причину изменения");
      const before = { ...t };
      Object.assign(t, patch);
      addAudit(user.id, user.name, "trainings", t.id, "UPDATE", before, t, body.p_reason);
      return ok(res, t.id);
    }
  }
  return false;
}
