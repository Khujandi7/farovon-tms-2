// Расширение mock Supabase для Phase 3A.2 (тренеры, обратная связь, обучение из заявки, отчёты). ТОЛЬКО для E2E.
// Настоящие правила (веса 40/40/20, порог анонимности, RLS, аудит) проверяют SQL-тесты phase3a2_tests.sql; здесь — интерфейс и права.
import { storeFor } from "./mock-phase3.mjs";

export const R1 = "88888888-8888-4888-8888-888888888881";
export const TRN1 = "99999999-9999-4999-8999-999999999991";
const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

const ok = (res, body, headers = {}) => { res.writeHead(200, { "content-type": "application/json", ...headers }); res.end(JSON.stringify(body)); return true; };
const pgErr = (res, status, code, message) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify({ code, message })); return true; };
const eqv = (url, k) => { const v = url.searchParams.get(k); return v && v.startsWith("eq.") ? v.slice(3) : null; };
const MANAGE = ["ADMIN", "ACADEMY_MANAGER"];

function lc(store) {
  if (!store.lc) {
    store.lc = {
      trainers: [{ id: TRN1, canonical_id: "TRN-0001", full_name: "Каримова Нигора", kind: "INTERNAL", organization: null }],
      links: [], // { training_id, trainer_id, role }
      invites: [], // { training_id, participant_id, employee: "...", status }
      nextTrainer: 2,
      request: { id: R1, canonical_id: "REQ-2026-001", plan_year: 2026, request_date: "2026-01-15", department_id: null, unit_id: null, requester_id: null, requester_raw: "Финансовый департамент", topic: "Курс по МСФО", direction: null, goal: "Повысить квалификацию", participants_planned: 4, format: null, kind: "EXTERNAL", trainer_raw: null, budget_amount: 5000, budget_currency: "TJS", period_raw: null, status: "APPROVED", comment: null, carry_forward: false, original_request_id: null, original_year: null, planned_year: null, created_at: "2026-01-15T00:00:00Z", updated_at: "2026-01-15T00:00:00Z", created_by: null, updated_by: null, archived_at: null, archived_by: null, archive_reason: null, submitted_via: null, request_link_id: null, contact: null, priority: "NORMAL", expected_result: null },
    };
  }
  return store.lc;
}
const PARTICIPANTS = [
  { id: "a0000000-0000-4000-8000-000000000001", name: "Алиев Рустам" },
  { id: "a0000000-0000-4000-8000-000000000002", name: "Бобоев Сухроб" },
  { id: "a0000000-0000-4000-8000-000000000003", name: "Валиев Фарход" },
  { id: "a0000000-0000-4000-8000-000000000004", name: "Гафуров Умед" },
];

export function handlePhase3a2(req, res, url, body, role, sid) {
  if (!url.pathname.startsWith("/rest/v1/")) return false;
  const store = storeFor(sid);
  const s = lc(store);
  const path = url.pathname.replace("/rest/v1/", "");
  const manage = MANAGE.includes(role);
  const money = ["ADMIN", "ACADEMY_MANAGER", "FINANCE", "VIEWER"].includes(role);

  if (req.method === "GET") {
    const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
    const out = (list) => (wantsObject ? (list.length === 1 ? ok(res, list[0]) : pgErr(res, 406, "PGRST116", "The result contains 0 rows")) : ok(res, list, { "content-range": list.length ? `0-${list.length - 1}/${list.length}` : "*/0" }));
    switch (path) {
      case "trainers": { const id = eqv(url, "id"); return out(s.trainers.filter((t) => !id || t.id === id)); }
      case "training_trainers": {
        const tid = eqv(url, "training_id"); const trid = eqv(url, "trainer_id");
        const rows = s.links.filter((l) => (!tid || l.training_id === tid) && (!trid || l.trainer_id === trid)).map((l) => ({ ...l, trainer: s.trainers.find((t) => t.id === l.trainer_id), training: store.trainings.find((t) => t.id === l.training_id) }));
        return out(rows);
      }
      case "feedback_invitations": return out(["ADMIN", "ACADEMY_MANAGER", "HR"].includes(role) ? s.invites.filter((i) => !eqv(url, "training_id") || i.training_id === eqv(url, "training_id")).map((i) => ({ participant_id: i.participant_id, status: i.status, employee: { full_name: i.name } })) : []);
      case "training_requests": { const id = eqv(url, "id"); return out([s.request].filter((r) => !id || r.id === id)); }
      case "v_certificates": return url.searchParams.get("training_id") ? out([]) : false;
      default: return false;
    }
  }

  if (path.startsWith("rpc/")) {
    const name = path.slice(4);
    const denied = () => pgErr(res, 403, "42501", "permission denied");
    switch (name) {
      case "training_summary": {
        return ok(res, [{ planned_participants: 4, added_participants: 4, present_participants: 3, completed_participants: 2, planned_hours: 8, actual_man_hours: 24,
          actual_cost_tjs: money ? 1500 : null, cost_per_participant: money ? 500 : null, cost_per_learning_hour: money ? 62.5 : null, budget_tjs: money ? 5000 : null, remaining_budget_tjs: money ? 3500 : null, trainers: s.links.length, sessions: 0 }]);
      }
      case "training_feedback_summary": {
        const tid = body.p_training;
        const inv = s.invites.filter((i) => i.training_id === tid);
        const ans = inv.filter((i) => i.status === "ANSWERED").length;
        const hidden = ans < 5 && !manage;
        return ok(res, [{ invited: inv.length, answered: ans, response_rate: inv.length ? Math.round((ans / inv.length) * 1000) / 10 : null,
          materials: hidden || !ans ? null : 4.5, trainer: hidden || !ans ? null : 5, org: hidden || !ans ? null : 3, final_score: hidden || !ans ? null : 4.4, scores_hidden: hidden }]);
      }
      case "training_results":
        return ok(res, PARTICIPANTS.map((p, i) => ({ participant_id: p.id, employee_id: `e${i}`, full_name: p.name, attended: i < 3, sessions_present: i < 3 ? 1 : 0, sessions_total: 1, result: null, status: i === 0 ? "CERTIFIED" : i === 1 ? "COMPLETED" : i === 2 ? "PARTIAL" : "ABSENT", certificate_id: null, certificate_number: i === 0 ? "IFRS-1" : null, exam_result: null })));
      case "upsert_trainer": {
        if (!manage) return denied();
        const n = String(body.p?.full_name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
        if (!n) return pgErr(res, 400, "P0015", "Укажите ФИО тренера");
        if (s.trainers.some((t) => t.full_name.toLowerCase() === n)) return pgErr(res, 400, "P0015", `Тренер «${body.p.full_name}» уже есть в справочнике`);
        const id = `99999999-9999-4999-8999-99999999999${s.nextTrainer}`;
        s.trainers.push({ id, canonical_id: `TRN-000${s.nextTrainer++}`, full_name: body.p.full_name, kind: body.p.kind ?? "EXTERNAL", organization: body.p.organization ?? null });
        return ok(res, id);
      }
      case "set_training_trainer": {
        if (!manage) return denied();
        if (body.p_role === "PRIMARY") for (const l of s.links) if (l.training_id === body.p_training && l.role === "PRIMARY") l.role = "CO";
        const ex = s.links.find((l) => l.training_id === body.p_training && l.trainer_id === body.p_trainer);
        if (ex) ex.role = body.p_role; else s.links.push({ training_id: body.p_training, trainer_id: body.p_trainer, role: body.p_role });
        return ok(res, null);
      }
      case "remove_training_trainer": {
        if (!manage) return denied();
        if (!(body.p_reason ?? "").trim()) return pgErr(res, 400, "P0012", "Укажите причину");
        s.links = s.links.filter((l) => !(l.training_id === body.p_training && l.trainer_id === body.p_trainer));
        return ok(res, null);
      }
      case "send_feedback_invitations": {
        if (!manage) return denied();
        const t = store.trainings.find((x) => x.id === body.p_training);
        if (!t || !["IN_PROGRESS", "COMPLETED"].includes(t.status)) return pgErr(res, 400, "P0015", `Обратную связь можно запросить после начала обучения (статус: ${t?.status})`);
        let n = 0;
        for (const p of PARTICIPANTS.slice(0, 4)) if (!s.invites.some((i) => i.training_id === t.id && i.participant_id === p.id)) { s.invites.push({ training_id: t.id, participant_id: p.id, name: p.name, status: "INVITED" }); n++; }
        return ok(res, n);
      }
      case "record_feedback_response": {
        if (!manage) return denied();
        const inv = s.invites.find((i) => i.participant_id === body.p_participant);
        if (!inv) return pgErr(res, 400, "P0015", "Участник не приглашён: анкета без приглашения не принимается");
        if (inv.status === "ANSWERED") return pgErr(res, 400, "P0015", "Участник уже ответил");
        inv.status = "ANSWERED";
        return ok(res, "r1");
      }
      case "create_training_from_request": {
        if (!manage) return denied();
        const r = s.request;
        if (!["APPROVED", "PLANNED"].includes(r.status)) return pgErr(res, 400, "P0015", `Обучение создаётся из утверждённой или запланированной заявки (сейчас: ${r.status})`);
        const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
        store.trainings.push({ id, canonical_id: "TR-2026-77", title: r.topic, format: "OFFLINE", kind: r.kind, status: "PLANNED", source_type: "PLANNED", source_confirmed: true, hours: Number(body.p?.hours ?? 4), start_date: body.p?.start_date, end_date: body.p?.end_date ?? body.p?.start_date, participants: 0, man_hours: 0, actual_tjs: 0, archived_at: null, request_id: r.id, location: null, participants_planned: r.participants_planned, description: r.goal, comment: null, unplanned_reason: null, attendance_mode: false, event_type_id: 1, provider_id: null, organizer: null, result_summary: null, created_by: null, updated_by: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z" });
        return ok(res, id);
      }
      case "set_request_details": {
        if (!manage) return denied();
        if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(body.p?.priority)) return pgErr(res, 400, "23514", "check");
        s.request.priority = body.p.priority; s.request.expected_result = body.p.expected_result ?? null;
        return ok(res, null);
      }
      case "set_session_details": return manage ? ok(res, null) : denied();
      case "dq_scan_lifecycle": return ok(res, []);
      case "lifecycle_kpis":
        return ok(res, [{ delivered_events: 1, planned_events: 1, unplanned_events: 0, participants: 4, unique_trained: 4, man_hours: 32, certificates_issued: 1, exams_total: 2, exams_passed: 1, invited: 4, answered: 1, response_rate: 25, avg_feedback: 4.4,
          actual_cost_tjs: money ? 1500 : null, cost_per_participant: money ? 375 : null, cost_per_learning_hour: money ? 46.88 : null }]);
      case "department_participation": return ok(res, [{ department: "Финансовый департамент", events: 1, participants: 4, unique_employees: 4, man_hours: 32 }]);
      case "trainer_performance": return ok(res, [{ trainer_id: TRN1, trainer: "Каримова Нигора", kind: "INTERNAL", organization: null, events: 1, participants: 4, man_hours: 32, avg_trainer_score: manage ? 5 : null, responses: 1, scores_hidden: !manage }]);
      case "global_search_ext": {
        const q = String(body?.p_q ?? "").toLowerCase();
        return ok(res, q.includes("каримова") ? [{ kind: "TRAINER", id: TRN1, title: "Каримова Нигора", subtitle: "TRN-0001 · INTERNAL", href: `/trainers/${TRN1}` }] : []);
      }
      default: return false;
    }
  }
  return false;
}
export { T1, T2 };
