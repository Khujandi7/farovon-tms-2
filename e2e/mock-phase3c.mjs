// Расширение mock Supabase для оргструктуры (справочник подразделений, массовое добавление, разрешение замечания импорта). ТОЛЬКО для E2E.
// Настоящую логику (дубликаты, права, RLS, идемпотентность, аудит, пересчёт строки) проверяет SQL-набор phase3c_tests.sql.
import { storeFor } from "./mock-phase3.mjs";

export const UNIT_JOB = "dddddddd-dddd-4ddd-8ddd-000000000001";
// Состояние Production: задание уже применено (COMMITTED), строка пропущена и осталась NEEDS_REVIEW/UNIT_UNKNOWN
export const DONE_JOB = "dddddddd-dddd-4ddd-8ddd-000000000002";
// Дозавершение (M26): применённое задание на 8 строк — 5 с неразрешённым подразделением, 3 уже применены ранее
export const FINISH_JOB = "dddddddd-dddd-4ddd-8ddd-000000000003";
const MANAGE = ["ADMIN", "ACADEMY_MANAGER", "HR"];
const ok = (res, body, headers = {}) => { res.writeHead(200, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); return true; };
const pgErr = (res, status, code, message) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ code, message })); return true; };
const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();

function st(store) {
  if (!store.c3) {
    store.c3 = {
      units: [
        { id: 1, name: "Финансовый департамент", parent_id: null, level: "DEPARTMENT", is_active: true },
        { id: 2, name: "Бухгалтерия", parent_id: 1, level: "UNIT", is_active: true },
        { id: 3, name: "Департамент рисков", parent_id: null, level: "DEPARTMENT", is_active: true },
      ],
      aliases: [], next: 100, nextRow: 1, bulkCalls: 0, reanalyzed: 0,
      doneRow: null,
      fin: { unresolved: 5, ready: 0, create: 0, update: 0, created: 0, updated: 0, unchanged: 0, review: 0, errors: 0, applyCalls: 0, reasons: [], reanalyzeCalls: 0, limits: [] },
      row: { id: 501, row_no: 2, status: "NEEDS_REVIEW", messages: ["Отдел «Цех откорма» не найден"], review_code: "UNIT_UNKNOWN",
        data: { employee_code: "F-0009", full_name: "Тестов Тест Тестович", position: "Оператор", department_id: 1, department: "Финансовый департамент", unit: "Цех откорма" }, raw: {}, candidates: [], decision: null, decision_match: null, match_id: null },
    };
  }
  if (!store.c3.doneRow) store.c3.doneRow = { ...JSON.parse(JSON.stringify(store.c3.row)), id: 502 };
  return store.c3;
}
const doneJob = (s) => ({ ...job(s), id: DONE_JOB, status: "COMMITTED", total_rows: 1, new_rows: s.doneRow.status === "NEW" ? 1 : 0, review_rows: s.doneRow.status === "NEEDS_REVIEW" ? 1 : 0,
  inserted: 0, updated: 0, skipped: 1, conflicts: s.doneRow.status === "NEEDS_REVIEW" ? 1 : 0, committed_at: "2026-10-09T11:00:00Z" });
const finJob = (s) => ({ ...job(s), id: FINISH_JOB, status: "COMMITTED", total_rows: 8, new_rows: s.fin.create + s.fin.created, updated_rows: s.fin.update + s.fin.updated, review_rows: s.fin.unresolved,
  inserted: 3 + s.fin.created, updated: s.fin.updated, skipped: 5, conflicts: s.fin.unresolved, committed_at: "2026-10-09T11:00:00Z" });
const job = (s) => ({ id: UNIT_JOB, entity: "EMPLOYEES", source: "FILE", file_name: "employees.csv", file_hash: "x", mapping: {}, options: {}, status: "STAGED", total_rows: 1,
  new_rows: s.row.status === "NEW" ? 1 : 0, updated_rows: 0, unchanged_rows: 0, duplicate_rows: 0, review_rows: s.row.status === "NEEDS_REVIEW" ? 1 : 0, error_rows: 0,
  inserted: 0, updated: 0, skipped: 0, conflicts: 0, apply_errors: 0, created_at: "2026-10-09T10:00:00Z", created_by: null, committed_at: null, cancelled_at: null, reason: null });

export function handlePhase3c(req, res, url, body, role, sid) {
  if (!url.pathname.startsWith("/rest/v1/")) return false;
  const s = st(storeFor(sid));
  const path = url.pathname.replace("/rest/v1/", "");
  const can = MANAGE.includes(role);
  if (req.method === "GET") {
    const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const out = (list) => (wantsObject ? (list.length === 1 ? ok(res, list[0]) : pgErr(res, 406, "PGRST116", "The result contains 0 rows")) : ok(res, list, { "content-range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" }));
    const sel = (url.searchParams.get("select") ?? "").replace(/\s+/g, "");
    const idEq = url.searchParams.get("id");
    switch (path) {
      case "org_units": {
        if (sel === "id,name,parent_id,level,is_active") return out(s.units);
        if (sel === "id,name,parent_id,level") return out(s.units.filter((u) => u.is_active));
        return false;
      }
      case "org_unit_aliases": return sel === "org_unit_id,alias_norm" ? out(s.aliases) : false;
      case "import_jobs": if (idEq === `eq.${FINISH_JOB}`) return out(can ? [finJob(s)] : []); return idEq === `eq.${UNIT_JOB}` ? out(can ? [job(s)] : []) : idEq === `eq.${DONE_JOB}` ? out(can ? [doneJob(s)] : []) : false;
      case "import_job_rows": {
        const jid = url.searchParams.get("job_id");
        if (jid === `eq.${FINISH_JOB}`) return sel === "id" || url.searchParams.get("status") === "eq.NEEDS_REVIEW" ? ok(res, [], { "content-range": `*/${s.fin.unresolved}` }) : out([]);
        const rw = jid === `eq.${UNIT_JOB}` ? s.row : jid === `eq.${DONE_JOB}` ? s.doneRow : null;
        if (!rw) return false;
        if (url.searchParams.get("status") === "eq.NEEDS_REVIEW" || sel === "id") return ok(res, [], { "content-range": `*/${rw.status === "NEEDS_REVIEW" ? 1 : 0}` });
        return out(can ? [rw] : []);
      }
      default: return false;
    }
  }
  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    const denied = () => pgErr(res, 403, "42501", "permission denied");
    switch (name) {
      case "create_org_units_bulk": {
        if (!can) return denied();
        s.bulkCalls++;
        const rows = Array.isArray(body.p_rows) ? body.p_rows : [];
        const r = { created: 0, skipped: 0, errors: [], skipped_items: [] };
        rows.forEach((x, i) => {
          const parent = x.parent ? s.units.find((u) => u.level === "DEPARTMENT" && u.is_active && norm(u.name) === norm(x.parent)) : null;
          if (x.parent && !parent) { r.errors.push({ index: i + 1, name: x.name, error: `Родитель «${x.parent}» не найден` }); return; }
          const level = x.parent ? "UNIT" : "DEPARTMENT";
          const dup = s.units.find((u) => u.level === level && (u.parent_id ?? null) === (parent?.id ?? null) && norm(u.name) === norm(x.name));
          if (dup) { r.skipped++; r.skipped_items.push({ index: i + 1, name: x.name, reason: "Уже есть в справочнике" }); return; }
          s.units.push({ id: s.next++, name: x.name, parent_id: parent?.id ?? null, level, is_active: true });
          r.created++;
        });
        return ok(res, r);
      }
      case "add_org_unit_alias": {
        if (!can) return denied();
        if (!String(body.p_reason ?? "").trim()) return pgErr(res, 400, "P0015", "Укажите причину изменения");
        const u = s.units.find((x) => x.id === body.p_id);
        if (!u) return pgErr(res, 400, "P0015", "Подразделение не найдено");
        const a = norm(body.p_alias);
        if (!s.aliases.some((x) => x.alias_norm === a)) s.aliases.push({ org_unit_id: u.id, alias_norm: a });
        return ok(res, u.id);
      }
      case "import_resolved_preview": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        const f = s.fin;
        return ok(res, { job_status: "COMMITTED", total: 8, ready: f.ready, ready_create: f.create, ready_update: f.update, unresolved_units: f.unresolved, needs_decision: 0, skipped_by_decision: 0,
          errors: f.errors, already_applied: 3, completed_now: f.created + f.updated, unchanged_after: f.unchanged,
          unresolved_names: f.unresolved > 0 ? [{ kind: "DEPARTMENT", name: "Птицефабрика №2", rows: f.unresolved }] : [],
          sample: f.ready > 0 ? [{ row_no: 2, full_name: "Тестов Тест", employee_code: "F-0010", verdict: "CREATE" }, { row_no: 3, full_name: "Образцов Олег", employee_code: "F-0011", verdict: "UPDATE" }] : [] });
      }
      case "import_reanalyze_job": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        const f = s.fin; f.reanalyzeCalls++;
        const resolved = Math.max(0, f.unresolved - 1); // одно подразделение так и не создано
        f.unresolved -= resolved; f.create += resolved - 1; f.update += 1; f.ready += resolved;
        return ok(res, { processed: resolved + (f.unresolved ? 1 : 0), resolved, unresolved: f.unresolved, errors: 0, first_error: null, next_after: 900, done: true, remaining: 0 });
      }
      case "import_apply_resolved_batch": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        if (!String(body.p_reason ?? "").trim()) return pgErr(res, 400, "P0012", "Укажите причину изменения");
        const f = s.fin; f.applyCalls++; f.reasons.push(body.p_reason); f.limits.push(body.p_limit);
        const take = Math.min(2, f.ready); // пакеты по 2 строки — чтобы увидеть несколько шагов
        const c = Math.min(take, f.create), u = take - c;
        f.create -= c; f.update -= u; f.ready -= take; f.created += c; f.updated += u;
        return ok(res, { processed: take, created: c, updated: u, unchanged: 0, needs_review: 0, errors: 0, next_after: 100 + f.applyCalls, remaining: f.ready, done: f.ready === 0 });
      }
      case "import_reanalyze_row": {
        if (!can) return pgErr(res, 400, "P0015", "Строка не найдена");
        const rw = body.p_row === s.doneRow.id ? s.doneRow : s.row;
        s.reanalyzed++;
        if (rw === s.doneRow) s.doneReanalyzed = (s.doneReanalyzed ?? 0) + 1;
        const d = rw.data;
        const found = s.units.some((u) => u.is_active && u.parent_id === d.department_id && norm(u.name) === norm(d.unit))
          || s.aliases.some((a) => a.alias_norm === norm(d.unit) && s.units.find((u) => u.id === a.org_unit_id)?.parent_id === d.department_id);
        if (found && rw.status === "NEEDS_REVIEW") { rw.status = "NEW"; rw.review_code = null; rw.messages = []; }
        return ok(res, { resolved: found, status: rw.status, messages: rw.messages });
      }
      default: return false;
    }
  }
  return false;
}

export function phase3cState(sid) { return st(storeFor(sid)); }
