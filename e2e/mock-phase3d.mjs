// Mock Supabase для решений по сотрудникам в применённом импорте (M30). ТОЛЬКО для E2E.
// Настоящую логику (права, дубли, идемпотентность, курсор) проверяет SQL-набор hotfix7_resolve_committed_tests.sql.
import { storeFor } from "./mock-phase3.mjs";

export const DEC_JOB = "dddddddd-dddd-4ddd-8ddd-000000000007";
const MANAGE = ["ADMIN", "ACADEMY_MANAGER", "HR"];
const ok = (res, body, headers = {}) => { res.writeHead(200, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); return true; };
const pgErr = (res, status, code, message) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ code, message })); return true; };

const person = (id, no, name, pos, cand) => ({ id, row_no: no, status: "NEEDS_REVIEW", messages: ["Подразделение найдено в справочнике", "Совпадение неточное: проверьте сотрудника"], review_code: "EMPLOYEE_FUZZY",
  data: { full_name: name, position: pos }, raw: { "ФИО": name, "Должность": pos },
  candidates: [{ employee_id: `00000000-0000-4000-8000-0000000000${id}`, full_name: cand, match_kind: "PARTIAL", position: "Грузчик", is_active: true }],
  decision: null, decision_match: null, match_id: null, applied_id: null, apply_action: "SKIPPED" });

function st(store) {
  if (!store.c4) {
    store.c4 = {
      rows: [person(61, 2, "Иванов Иван Иванов", "Оператор", "Иванов Иван Иванович"), person(62, 3, "Петров Пётр Пётров", "Мастер", "Петров Пётр Петрович"),
             person(63, 4, "Сидоров Сидор Семёнов", "Водитель", "Сидоров Сидор Сергеевич"), person(64, 5, "Кузнецов Кузьма Кузнецов", "Охранник", "Кузнецов Кузьма Кузьмич")],
      bulkCalls: [], applyCalls: [], resolveCalls: [], reasons: [], created: 0, updated: 0,
    };
  }
  return store.c4;
}
const pending = (s) => s.rows.filter((r) => r.status === "NEEDS_REVIEW" && !r.applied_id);
const job = (s) => ({ id: DEC_JOB, entity: "EMPLOYEES", source: "XLSX", file_name: "employees.xlsx", file_hash: "x", mapping: {}, options: {}, status: "COMMITTED", total_rows: 4 + 10,
  new_rows: 10 + s.created, updated_rows: s.updated, unchanged_rows: 0, duplicate_rows: 0, review_rows: pending(s).length, error_rows: 0, inserted: 10 + s.created, updated: s.updated, skipped: pending(s).length,
  conflicts: pending(s).length, apply_errors: 0, created_at: "2026-10-09T10:00:00Z", created_by: null, committed_at: "2026-10-09T12:15:19Z", cancelled_at: null, reason: null });

export function handlePhase3d(req, res, url, body, role, sid) {
  if (!url.pathname.startsWith("/rest/v1/")) return false;
  const s = st(storeFor(sid));
  const path = url.pathname.replace("/rest/v1/", "");
  const can = MANAGE.includes(role);
  if (req.method === "GET") {
    const sel = (url.searchParams.get("select") ?? "").replace(/\s+/g, "");
    const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const out = (list) => (wantsObject ? (list.length === 1 ? ok(res, list[0]) : pgErr(res, 406, "PGRST116", "The result contains 0 rows")) : ok(res, list, { "content-range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" }));
    if (path === "import_jobs" && url.searchParams.get("id") === `eq.${DEC_JOB}`) return out(can ? [job(s)] : []);
    if (path === "import_job_rows" && url.searchParams.get("job_id") === `eq.${DEC_JOB}`) {
      if (url.searchParams.get("apply_action")) return out([]);
      if (sel === "id") { const n = s.rows.filter((r) => r.status === "NEEDS_REVIEW" && r.decision == null).length; return ok(res, [], { "content-range": `*/${n}` }); }
      const st0 = url.searchParams.get("status");
      const list = s.rows.filter((r) => !st0 || st0 === `eq.${r.status}`);
      return ok(res, can ? list : [], { "content-range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" });
    }
    return false;
  }
  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    switch (name) {
      case "import_decisions_summary": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        const p = pending(s);
        return ok(res, { job_status: "COMMITTED", total: p.length, undecided: p.filter((r) => !r.decision).length, to_create: p.filter((r) => r.decision === "APPLY").length,
          to_match: p.filter((r) => r.decision === "MATCH").length, to_skip: p.filter((r) => r.decision === "SKIP").length, errors: 0 });
      }
      case "import_resolve_row": {
        if (!can) return pgErr(res, 400, "P0015", "Строка не найдена");
        const r = s.rows.find((x) => x.id === body.p_row);
        if (!r || r.applied_id) return pgErr(res, 400, "P0015", "Импорт уже завершён");
        s.resolveCalls.push({ row: r.row_no, decision: body.p_decision, match: body.p_match ?? null });
        r.decision = body.p_decision; r.decision_match = body.p_decision === "MATCH" ? body.p_match : null;
        return ok(res, null);
      }
      case "import_resolve_rows_bulk": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        s.bulkCalls.push(body.p_decision);
        let n = 0;
        for (const r of pending(s)) {
          if (body.p_decision === "CLEAR" ? r.decision != null : r.decision == null) { r.decision = body.p_decision === "CLEAR" ? null : body.p_decision; r.decision_match = null; n++; }
        }
        return ok(res, { changed: n, remaining: 0, done: true });
      }
      case "import_apply_decided_batch": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        if (!String(body.p_reason ?? "").trim()) return pgErr(res, 400, "P0012", "Укажите причину изменения");
        s.reasons.push(body.p_reason); s.applyCalls.push(body.p_limit);
        const todo = pending(s).filter((r) => r.decision === "APPLY" || r.decision === "MATCH").slice(0, 2); // пакеты по 2 строки — несколько шагов
        let c = 0, u = 0;
        for (const r of todo) { r.applied_id = `00000000-0000-4000-9000-0000000000${r.id}`; r.status = r.decision === "APPLY" ? "NEW" : "UPDATED"; r.review_code = null; if (r.decision === "APPLY") c++; else u++; }
        s.created += c; s.updated += u;
        const rest = pending(s).filter((r) => r.decision === "APPLY" || r.decision === "MATCH").length;
        return ok(res, { processed: todo.length, created: c, updated: u, errors: 0, next_after: todo.length ? todo[todo.length - 1].row_no : 0, remaining: rest, done: rest === 0 });
      }
      default: return false;
    }
  }
  return false;
}

export function phase3dState(sid) { return st(storeFor(sid)); }
