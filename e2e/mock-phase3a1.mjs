// Расширение mock Supabase для Phase 3A.1 (досье сотрудника, экзамены, сертификаты, финансирование, портал заявок,
// уведомления, поиск, импорт). ТОЛЬКО для E2E: настоящую логику (RLS, RPC, Storage) проверяют SQL-тесты.
export const E1 = "44444444-4444-4444-8444-444444444444";
export const X1 = "55555555-5555-4555-8555-555555555551";
export const X2 = "55555555-5555-4555-8555-555555555552";
export const C1 = "66666666-6666-4666-8666-666666666661";
export const A1 = "77777777-7777-4777-8777-777777777771";
export const TOKEN = "ab".repeat(24);

const MONEY = ["ADMIN", "ACADEMY_MANAGER", "FINANCE"];
const pub = { submitted: [] };
export const portalStore = pub;

const employees = () => [{
  id: E1, canonical_id: "E-0001", full_name: "Убайдуллоев Азам", name_norm: "убайдуллоев азам", employee_code: "F-0001", position: "Наставник по ИИ",
  department_id: 1, unit_id: 2, is_active: true, hire_date: "2024-02-01", termination_date: null, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
}];
const orgUnits = [
  { id: 1, name: "Финансовый департамент", parent_id: null, level: "DEPARTMENT", is_active: true },
  { id: 2, name: "Бухгалтерия", parent_id: 1, level: "UNIT", is_active: true },
];
const exams = () => [
  { id: X2, canonical_id: "EX-2026-2", employee_id: E1, skill_id: 1, attempt_no: 2, exam_date: "2026-06-15", status: "COMPLETED", result: "PASSED", score: 78, provider_id: null, training_id: null, comment: null, archived_at: null,
    skill: { name: "CAP" }, skills: { name: "CAP" }, provider: null, employee: { full_name: "Убайдуллоев Азам" }, employees: { full_name: "Убайдуллоев Азам" } },
  { id: X1, canonical_id: "EX-2026-1", employee_id: E1, skill_id: 1, attempt_no: 1, exam_date: "2026-02-10", status: "COMPLETED", result: "FAILED", score: 41, provider_id: null, training_id: null, comment: null, archived_at: null,
    skill: { name: "CAP" }, skills: { name: "CAP" }, provider: null, employee: { full_name: "Убайдуллоев Азам" }, employees: { full_name: "Убайдуллоев Азам" } },
];
const certs = () => {
  const exp = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  return [{ id: C1, employee_id: E1, name: "CAP Certificate", cert_type: "CERTIFICATION", issuing_organization: "CIPA", issue_date: "2026-06-20", expiration_date: exp,
    certificate_number: "CAP-001", status: "ACTIVE", days_left: 20, revoked_at: null, exam_id: X2, training_id: null, provider_id: null, skill_id: 1, notes: null, archived_at: null,
    employee: { full_name: "Убайдуллоев Азам" }, employees: { full_name: "Убайдуллоев Азам" } }];
};
const agreements = () => [{
  id: A1, canonical_id: "AG-2026-1", employee_id: E1, exam_id: X1, training_id: null, policy_id: null, status: "OBLIGATION_CREATED", outcome: "FAILED",
  total_cost: 2000, currency: "TJS", total_cost_tjs: 2000, fx_rate: 1, cost_date: "2026-02-01", company_coverage_percent: 100, company_funded_amount: 2000,
  employee_responsibility_percent: 50, repayment_amount: 1000, contract_number: "Д-17", contract_date: "2026-01-20", contract_document_id: null,
  conditions: null, note: null, evaluated_at: "2026-02-20T00:00:00Z", reviewed_at: null, review_note: null, created_at: "2026-01-20T00:00:00Z", updated_at: "2026-02-20T00:00:00Z",
  employee: { full_name: "Убайдуллоев Азам" }, employees: { full_name: "Убайдуллоев Азам", canonical_id: "E-0001" },
}];
const eventTypes = ["TRAINING", "SEMINAR", "FORUM", "CONFERENCE", "WORKSHOP", "MASTERCLASS", "WEBINAR", "COURSE", "CERTIFICATION_PREP", "EXAM", "INDIVIDUAL_EDUCATION", "OTHER"]
  .map((code, i) => ({ id: i + 1, code, name: { TRAINING: "Обучение", SEMINAR: "Семинар", FORUM: "Форум", CONFERENCE: "Конференция", WORKSHOP: "Воркшоп", MASTERCLASS: "Мастер-класс", WEBINAR: "Вебинар", COURSE: "Курс", CERTIFICATION_PREP: "Подготовка к сертификации", EXAM: "Экзамен", INDIVIDUAL_EDUCATION: "Индивидуальное обучение", OTHER: "Другое" }[code], is_system: true, is_group: code !== "INDIVIDUAL_EDUCATION", is_active: true, sort_order: i }));

const ok = (res, body, headers = {}) => { res.writeHead(200, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); return true; };
const pgErr = (res, status, code, message) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ code, message })); return true; };
const cond = (v, c) => {
  if (!c) return true;
  if (c.startsWith("eq.")) return String(v) === c.slice(3);
  if (c.startsWith("in.")) return c.slice(4, -1).split(",").map((x) => x.replace(/"/g, "")).includes(String(v));
  if (c === "is.null") return v === null || v === undefined;
  return true;
};
function rows(req, res, url, list, cols = ["id", "employee_id", "exam_id", "result", "status", "is_active", "level", "parent_id"]) {
  let out = list.filter((r) => cols.every((c) => !(c in r) || cond(r[c], url.searchParams.get(c))));
  const total = out.length;
  const limit = Number(url.searchParams.get("limit") ?? 1000);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  out = out.slice(offset, offset + limit);
  if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) return out.length === 1 ? ok(res, out[0]) : pgErr(res, 406, "PGRST116", "The result contains 0 rows");
  return ok(res, out, { "content-range": out.length ? `${offset}-${offset + out.length - 1}/${total}` : `*/${total}` });
}

/** Публичный портал: только функции, выданные service_role (анонимный браузер сюда не ходит). */
export function handlePublic(req, res, url, body) {
  if (url.pathname === "/rest/v1/rpc/public_request_options") {
    const t = body?.p_token ?? "";
    const dept = [{ id: 1, name: "Финансовый департамент", units: [{ id: 2, name: "Бухгалтерия" }] }];
    if (t === "") return ok(res, { mode: "GENERAL", label: "Заявка на обучение", departments: dept });
    if (t === TOKEN) return ok(res, { mode: "DEPARTMENT", label: "Финансовый департамент", departments: dept });
    return ok(res, null);
  }
  if (url.pathname === "/rest/v1/rpc/submit_public_request") {
    if (body?.p_token && body.p_token !== TOKEN) return pgErr(res, 400, "P0018", "Ссылка недействительна");
    pub.submitted.push(body);
    return ok(res, { code: `REQ-2026-${String(pub.submitted.length).padStart(3, "0")}`, id: "x" });
  }
  return false;
}

/** Данные Phase 3A.1 для вошедшего пользователя. Возвращает true, если запрос обработан. */
export function handlePhase3a1(req, res, url, body, role) {
  if (!url.pathname.startsWith("/rest/v1/")) return false;
  const path = url.pathname.replace("/rest/v1/", "");
  const money = MONEY.includes(role);
  if (req.method === "GET") {
    switch (path) {
      case "employees": return rows(req, res, url, employees());
      case "org_units": return rows(req, res, url, orgUnits);
      case "exams": return rows(req, res, url, exams());
      case "v_certificates": case "certificates": return rows(req, res, url, certs());
      case "learning_agreements": return rows(req, res, url, money ? agreements() : []);
      case "exam_costs": return rows(req, res, url, money ? [{ id: "c1", exam_id: X1, fee: 2000, currency: "TJS", fee_tjs: 2000, fee_date: "2026-02-01", fx_rate: 1, funding_source: "COMPANY", note: null }] : []);
      case "learning_event_types": return rows(req, res, url, eventTypes);
      case "skills": return rows(req, res, url, [{ id: 1, name: "CAP", kind: "QUALIFICATION", is_active: true }]);
      case "notifications": return rows(req, res, url, [{ id: "n1", type: "CERTIFICATE_EXPIRING", severity: "WARNING", title: "Сертификат истекает через 30 дней", body: "CAP Certificate — Убайдуллоев Азам", href: `/employees/${E1}?tab=certificates`, created_at: "2026-10-01T09:00:00Z" }]);
      case "request_links": return rows(req, res, url, role === "ADMIN" ? [{ id: "l1", token: TOKEN, scope: "DEPARTMENT", org_unit_id: 1, label: "Финансовый департамент", is_active: true, expires_at: null, uses_count: 3, last_used_at: "2026-10-01T09:00:00Z", replaced_by: null, created_at: "2026-09-01T00:00:00Z" }] : []);
      default: return false;
    }
  }
  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    switch (name) {
      case "employee_learning_summary":
        return ok(res, [{ events_count: 3, man_hours: 40, planned_count: 2, unplanned_count: 1, exams_passed: 1, exams_failed: 1, exams_total: 2, certificates_active: 1, certificates_total: 1,
          company_spent_tjs: role === "HR" ? null : 4000, individual_education_tjs: role === "HR" ? null : 1200, employee_obligation_tjs: role === "HR" ? null : 1000, outstanding_obligation_tjs: role === "HR" ? null : 1000 }]);
      case "employee_timeline":
        return ok(res, [
          { event_date: "2026-06-20", kind: "CERTIFICATE", title: "CAP Certificate", detail: "CIPA", status: "ACTIVE", ref_table: "certificates", ref_id: C1 },
          { event_date: "2026-06-15", kind: "EXAM", title: "CAP — попытка 2", detail: "EX-2026-2", status: "PASSED", ref_table: "exams", ref_id: X2 },
          { event_date: "2026-02-10", kind: "EXAM", title: "CAP — попытка 1", detail: "EX-2026-1", status: "FAILED", ref_table: "exams", ref_id: X1 },
        ]);
      case "employee_dossier": return ok(res, []);
      case "notify_scan": return ok(res, 0);
      case "attention_summary":
        return ok(res, [
          { kind: "CERT_EXPIRING", label: "Сертификаты истекают", cnt: 1, href: "/certificates?expiring=1", severity: "WARNING" },
          { kind: "EXAM_NO_RESULT", label: "Экзамены требуют результата", cnt: 2, href: "/exams?result=PENDING", severity: "WARNING" },
        ]);
      case "global_search": {
        const q = String(body?.p_q ?? "").toLowerCase();
        if (!q.includes("cap")) return ok(res, []);
        return ok(res, [
          { kind: "exam", id: X2, title: "CAP — попытка 2", subtitle: "Убайдуллоев Азам", href: `/exams/${X2}` },
          { kind: "certificate", id: C1, title: "CAP Certificate", subtitle: "Убайдуллоев Азам", href: `/employees/${E1}?tab=certificates` },
          { kind: "employee", id: E1, title: "Убайдуллоев Азам", subtitle: "E-0001", href: `/employees/${E1}` },
        ]);
      }
      case "mark_notifications_read": return ok(res, 1);
      default: return false;
    }
  }
  return false;
}

/** Последний рубеж: неизвестные таблицы — пусто, неизвестные RPC — пусто (интерфейс должен выдерживать пустые данные). */
export function handleFallback(req, res, url) {
  if (!url.pathname.startsWith("/rest/v1/")) return false;
  if (req.method === "GET") {
    if ((req.headers.accept ?? "").includes("vnd.pgrst.object")) return pgErr(res, 406, "PGRST116", "The result contains 0 rows");
    return ok(res, [], { "content-range": "*/0" });
  }
  if (url.pathname.startsWith("/rest/v1/rpc/")) return ok(res, []);
  return false;
}
