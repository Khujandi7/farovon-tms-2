// Расширение mock Supabase для оргструктуры (справочник подразделений, массовое добавление, разрешение замечания импорта). ТОЛЬКО для E2E.
// Настоящую логику (дубликаты, права, RLS, идемпотентность, аудит, пересчёт строки) проверяет SQL-набор phase3c_tests.sql.
import { storeFor } from "./mock-phase3.mjs";

export const UNIT_JOB = "dddddddd-dddd-4ddd-8ddd-000000000001";
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
      row: { id: 501, row_no: 2, status: "NEEDS_REVIEW", messages: ["Отдел «Цех откорма» не найден"], review_code: "UNIT_UNKNOWN",
        data: { employee_code: "F-0009", full_name: "Тестов Тест Тестович", position: "Оператор", department_id: 1, department: "Финансовый департамент", unit: "Цех откорма" }, raw: {}, candidates: [], decision: null, decision_match: null, match_id: null },
    };
  }
  return store.c3;
}
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
      case "import_jobs": return idEq === `eq.${UNIT_JOB}` ? out(can ? [job(s)] : []) : false;
      case "import_job_rows": {
        if (url.searchParams.get("job_id") !== `eq.${UNIT_JOB}`) return false;
        if (url.searchParams.get("status") === "eq.NEEDS_REVIEW" || sel === "id") return ok(res, [], { "content-range": `*/${s.row.status === "NEEDS_REVIEW" ? 1 : 0}` });
        return out(can ? [s.row] : []);
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
      case "import_reanalyze_row": {
        if (!can) return pgErr(res, 400, "P0015", "Строка не найдена");
        s.reanalyzed++;
        const d = s.row.data;
        const found = s.units.some((u) => u.is_active && u.parent_id === d.department_id && norm(u.name) === norm(d.unit))
          || s.aliases.some((a) => a.alias_norm === norm(d.unit) && s.units.find((u) => u.id === a.org_unit_id)?.parent_id === d.department_id);
        if (found && s.row.status === "NEEDS_REVIEW") { s.row.status = "NEW"; s.row.review_code = null; s.row.messages = []; }
        return ok(res, { resolved: found, status: s.row.status, messages: s.row.messages });
      }
      default: return false;
    }
  }
  return false;
}

export function phase3cState(sid) { return st(storeFor(sid)); }
