// Расширение mock Supabase для оргструктуры (справочник подразделений, массовое добавление, разрешение замечания импорта). ТОЛЬКО для E2E.
// Настоящую логику (дубликаты, права, RLS, идемпотентность, аудит, пересчёт строки) проверяет SQL-набор phase3c_tests.sql.
import { storeFor } from "./mock-phase3.mjs";

export const UNIT_JOB = "dddddddd-dddd-4ddd-8ddd-000000000001";
// Состояние Production: задание уже применено (COMMITTED), строка пропущена и осталась NEEDS_REVIEW/UNIT_UNKNOWN
export const DONE_JOB = "dddddddd-dddd-4ddd-8ddd-000000000002";
// Дозавершение (M26): применённое задание на 8 строк — 5 с неразрешённым подразделением, 3 уже применены ранее
export const FINISH_JOB = "dddddddd-dddd-4ddd-8ddd-000000000003";
// Массовое сопоставление (M27): применённое задание на 13 строк — 10 с неразрешённым подразделением в 4 уникальных значениях, 3 применены ранее
export const MAP_JOB = "dddddddd-dddd-4ddd-8ddd-000000000005";
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
      map: {
        previewCalls: 0, saveCalls: 0, reasons: [], reanalyzeCalls: 0, saved: [], nextUnit: 500,
        groups: [
          { kind: "UNIT", src_name: "Кадры", src_norm: "кадры", scope: "P:1", scope_label: "Финансовый департамент", rows: 4, sample_rows: [2, 3], cause: "SIMILAR", action: "DECIDE", state: "open", mapped_to: null, resolved_to: null,
            candidates: [{ id: 10, level: "UNIT", name: "Отдел кадров", parent_id: 1, path: "Финансовый департамент › Отдел кадров", kind: "SIMILAR", allowed: true, why: null },
              { id: 11, level: "UNIT", name: "Отдел кадров", parent_id: 3, path: "Департамент рисков › Отдел кадров", kind: "SIMILAR", allowed: false, why: "Относится к другому департаменту" }] },
          { kind: "UNIT", src_name: "Охрана труда", src_norm: "охрана труда", scope: "P:3", scope_label: "Департамент рисков", rows: 2, sample_rows: [8, 9], cause: "OTHER_PARENT", action: "DECIDE", state: "open", mapped_to: null, resolved_to: null,
            candidates: [{ id: 12, level: "UNIT", name: "Охрана труда", parent_id: 1, path: "Финансовый департамент › Охрана труда", kind: "EXACT", allowed: false, why: "Относится к другому департаменту" }] },
          { kind: "DEPARTMENT", src_name: "Птицефабрика №2", src_norm: "птицефабрика 2", scope: "", scope_label: "", rows: 3, sample_rows: [5], cause: "MISSING", action: "CREATE", state: "open", mapped_to: null, resolved_to: null, candidates: [] },
          { kind: "UNIT", src_name: "Цех Х", src_norm: "цех х", scope: "D:птицефабрика 2", scope_label: "птицефабрика 2", rows: 1, sample_rows: [6], cause: "PARENT_UNRESOLVED", action: "DEPT_FIRST", state: "open", mapped_to: null, resolved_to: null, candidates: [] },
        ],
        fin: { unresolved: 10, ready: 0, create: 0, update: 0, created: 0, updated: 0, unchanged: 0, review: 0, errors: 0, applyCalls: 0, reasons: [], reanalyzeCalls: 0, limits: [] },
      },
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
const mapJob = (s) => ({ ...job(s), id: MAP_JOB, status: "COMMITTED", total_rows: 13, new_rows: s.map.fin.create + s.map.fin.created, updated_rows: s.map.fin.update + s.map.fin.updated, review_rows: s.map.fin.unresolved,
  inserted: 3 + s.map.fin.created, updated: s.map.fin.updated, skipped: 10, conflicts: s.map.fin.unresolved, committed_at: "2026-10-09T11:00:00Z" });
const mapScan = (s) => {
  const open = s.map.groups.filter((g) => g.state !== "done");
  const byCause = {};
  const list = open.map((g) => { const c = g.state === "mapped" ? "MAPPED" : g.cause; byCause[c] = { groups: (byCause[c]?.groups ?? 0) + 1, rows: (byCause[c]?.rows ?? 0) + g.rows };
    return { ...g, cause: g.state === "mapped" ? "MAPPED" : g.cause, action: g.state === "mapped" ? "REANALYZE" : g.action }; });
  return { job_status: "COMMITTED", groups: list.length, mapped_groups: open.filter((g) => g.state === "mapped").length, by_cause: byCause, offset: 0, limit: 300,
    rows_with_unit_issue: open.reduce((n, g) => n + g.rows, 0), duplicates: 2, review_breakdown: [{ code: "UNIT_UNKNOWN", rows: open.reduce((n, g) => n + g.rows, 0), with_unit_issue: open.reduce((n, g) => n + g.rows, 0) }],
    protected: { applied: 3, skipped_by_decision: 0 }, groups_list: list };
};
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
      case "import_jobs": if (idEq === `eq.${MAP_JOB}`) return out(can ? [mapJob(s)] : []); if (idEq === `eq.${FINISH_JOB}`) return out(can ? [finJob(s)] : []); return idEq === `eq.${UNIT_JOB}` ? out(can ? [job(s)] : []) : idEq === `eq.${DONE_JOB}` ? out(can ? [doneJob(s)] : []) : false;
      case "import_job_rows": {
        const jid = url.searchParams.get("job_id");
        if (jid === `eq.${MAP_JOB}`) return sel === "id" || url.searchParams.get("status") === "eq.NEEDS_REVIEW" ? ok(res, [], { "content-range": `*/${s.map.fin.unresolved}` }) : out([]);
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
        const f = body.p_job === MAP_JOB ? s.map.fin : s.fin;
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
      case "import_orgmap_scan": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        if (body.p_job === MAP_JOB) return ok(res, mapScan(s));
        const n = s.fin.unresolved;
        return ok(res, { job_status: "COMMITTED", groups: n ? 1 : 0, mapped_groups: 0, by_cause: n ? { MISSING: { groups: 1, rows: n } } : {}, offset: 0, limit: 300, rows_with_unit_issue: n, duplicates: 0, review_breakdown: [],
          protected: { applied: 3, skipped_by_decision: 0 },
          groups_list: n ? [{ kind: "DEPARTMENT", src_name: "Птицефабрика №2", src_norm: "птицефабрика 2", scope: "", scope_label: "", rows: n, sample_rows: [2], cause: "MISSING", action: "CREATE", mapped_to: null, resolved_to: null, candidates: [] }] : [] });
      }
      case "import_orgmap_apply": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        const m = s.map; const dry = body.p_dry !== false;
        if (!dry && !String(body.p_reason ?? "").trim()) return pgErr(res, 400, "P0012", "Укажите причину изменения");
        if (dry) m.previewCalls++; else { m.saveCalls++; m.reasons.push(body.p_reason); }
        const items = (Array.isArray(body.p_items) ? body.p_items : []).map((it, i) => {
          const g = m.groups.find((x) => x.kind === it.kind && x.src_name === it.src_name && x.scope === it.scope && x.state !== "done");
          const base = { index: i + 1, kind: it.kind, src_name: it.src_name, scope: it.scope, action: it.action };
          if (!g) return { ...base, ok: false, error: "Значение не найдено" };
          if (it.action === "MAP" || it.action === "ALIAS") {
            const c = g.candidates.find((x) => x.id === it.org_unit_id);
            if (!c || !c.allowed) return { ...base, ok: false, error: `Отдел «${c?.name ?? it.src_name}» относится к другому департаменту — он не будет привязан к чужому` };
            if (!dry) { g.state = "mapped"; g.mapped_to = { id: c.id, path: c.path }; m.saved.push({ action: it.action, name: it.src_name, to: c.path }); }
            return { ...base, ok: true, changed: true, rows: g.rows, alias_added: it.action === "ALIAS", created_id: null };
          }
          if (it.action === "CREATE") {
            if (g.kind === "UNIT" && g.cause === "OTHER_PARENT" && !it.confirm_homonym) return { ...base, ok: false, error: "Такое название уже есть у другого родителя: подтвердите, что это другое подразделение, или сопоставьте с существующим" };
            if (g.kind === "UNIT" && g.scope.startsWith("D:")) return { ...base, ok: false, error: "Нельзя создать отдел без департамента: сначала сопоставьте или создайте департамент из файла" };
            const id = m.nextUnit + (dry ? 0 : 0);
            if (!dry) { m.nextUnit++; g.state = "mapped"; g.mapped_to = { id, path: g.src_name }; m.saved.push({ action: "CREATE", name: it.src_name, to: g.src_name }); }
            return { ...base, ok: true, changed: true, rows: g.rows, alias_added: false, created_id: id };
          }
          return { ...base, ok: true, changed: false, rows: 0, alias_added: false, created_id: null };
        });
        const okc = items.filter((x) => x.ok);
        return ok(res, { dry, items, ok: okc.length, failed: items.length - okc.length, mapped: okc.filter((x) => x.action === "MAP").length, aliases: okc.filter((x) => x.action === "ALIAS").length,
          created: okc.filter((x) => x.action === "CREATE").length, cleared: 0, rows_affected: okc.reduce((n, x) => n + (x.rows ?? 0), 0) });
      }
      case "import_orgmap_reanalyze_batch": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        if (body.p_job === MAP_JOB) {
          const m = s.map; m.reanalyzeCalls++;
          const done = m.groups.filter((g) => g.state === "mapped");
          const R = done.reduce((n, g) => n + g.rows, 0);
          done.forEach((g) => { g.state = "done"; });
          const f = m.fin; f.unresolved -= R; f.ready += R; f.update += R >= 5 ? 1 : 0; f.create += R - (R >= 5 ? 1 : 0);
          return ok(res, { processed: R + f.unresolved, resolved: R, unresolved: f.unresolved, errors: 0, first_error: null, next_after: 900, done: true, remaining: 0 });
        }
        const f = s.fin; f.reanalyzeCalls++;
        const resolved = Math.max(0, f.unresolved - 1);
        f.unresolved -= resolved; f.create += resolved - 1; f.update += 1; f.ready += resolved;
        return ok(res, { processed: resolved + (f.unresolved ? 1 : 0), resolved, unresolved: f.unresolved, errors: 0, first_error: null, next_after: 900, done: true, remaining: 0 });
      }
      case "import_apply_resolved_batch": {
        if (!can) return pgErr(res, 400, "P0015", "Импорт не найден");
        if (!String(body.p_reason ?? "").trim()) return pgErr(res, 400, "P0012", "Укажите причину изменения");
        const f = body.p_job === MAP_JOB ? s.map.fin : s.fin; f.applyCalls++; f.reasons.push(body.p_reason); f.limits.push(body.p_limit);
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
