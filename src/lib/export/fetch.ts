import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SOURCE_TYPE_LABELS, TRAINING_FORMAT_LABELS, TRAINING_STATUS_LABELS } from "@/lib/labels";
import { applyEmployeeFilters, applyEmployeeSort, EMPLOYEE_SELECT, employeesWithOpenRemarks, fetchEmployeeStats } from "@/lib/employees/query";
import type { AppRole } from "@/lib/auth/roles";
import { EXPORT_LIMIT, canSeeMoney, type ExportEntity } from "./columns";
import type { ExportRequest } from "./params";
import type { Cell } from "./csv";

export type ExportRow = Record<string, Cell>;
export type ExportData = { rows: ExportRow[]; truncated: boolean };

const PAGE = 1000;
type Page = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

/** Постраничная выборка (PostgREST отдаёт не больше 1000 строк за запрос) до лимита выгрузки + 1 строка, чтобы понять, что данные обрезаны. */
async function fetchAll<T>(run: (from: number, to: number) => Page): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  for (let from = 0; from <= EXPORT_LIMIT; from += PAGE) {
    const { data, error } = await run(from, Math.min(from + PAGE - 1, EXPORT_LIMIT));
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  const truncated = rows.length > EXPORT_LIMIT;
  return { rows: truncated ? rows.slice(0, EXPORT_LIMIT) : rows, truncated };
}

const EXAM_RESULT_LABELS: Record<string, string> = { PENDING: "Ожидается", PASSED: "Сдан", FAILED: "Не сдан", NOT_ATTENDED: "Не явился", OTHER: "Другое" };
const EXAM_STATUS_LABELS: Record<string, string> = { SCHEDULED: "Запланирован", COMPLETED: "Проведён", CANCELLED: "Отменён" };
const CERT_STATUS_LABELS: Record<string, string> = { ACTIVE: "Действует", NO_EXPIRATION: "Бессрочный", EXPIRED: "Истёк", REVOKED: "Отозван" };
const AGREEMENT_STATUS_LABELS: Record<string, string> = { ACTIVE: "Действует", COMPLETED: "Завершено", OBLIGATION_CREATED: "Возникло обязательство", PARTIALLY_REPAID: "Частично погашено", REPAID: "Погашено", CANCELLED: "Отменено" };
const OUTCOME_LABELS: Record<string, string> = { PASSED: "Сдан", FAILED: "Не сдан", COMPLETED: "Завершено", NOT_COMPLETED: "Не завершено" };
const PARTICIPANT_RESULT_LABELS: Record<string, string> = { COMPLETED: "Завершил", NOT_COMPLETED: "Не завершил", PASSED: "Сдал", FAILED: "Не сдал" };
const lab = (m: Record<string, string>, v: unknown) => (typeof v === "string" ? (m[v] ?? v) : null);
const name = (v: unknown): string | null => (v && typeof v === "object" && "name" in v ? ((v as { name: string | null }).name ?? null) : null);
type Emp = { full_name: string; employee_code: string | null } | null;
const emp = (v: unknown) => (v as Emp) ?? null;

/**
 * Все запросы идут под сессией пользователя (RLS), не под service_role: роль без права видеть строки/колонки получит пустое значение.
 * Денежные поля не запрашиваются вовсе, если роль не имеет права на деньги по сущности.
 */
export async function fetchExportRows(req: ExportRequest, role: AppRole): Promise<ExportData> {
  const supabase = await createClient();
  const money = canSeeMoney(role, req.entity);

  switch (req.entity) {
    case "employees": {
      const f = req.filters;
      const remarkIds = f.remarks ? await employeesWithOpenRemarks(supabase) : [];
      const { rows, truncated } = await fetchAll<Record<string, unknown>>((from, to) =>
        applyEmployeeSort(applyEmployeeFilters(supabase.from("employees").select(EMPLOYEE_SELECT), f, remarkIds), f).range(from, to),
      );
      const stats = await fetchEmployeeStats(supabase, rows.map((r) => r.id as string));
      return {
        truncated,
        rows: rows.map((e) => ({
          employee_code: e.employee_code as string | null,
          canonical_id: e.canonical_id as string,
          full_name: e.full_name as string,
          position: e.position as string | null,
          department: name(e.department),
          unit: name(e.unit),
          status: e.is_active ? "Активен" : "Неактивен",
          hire_date: e.hire_date as string | null,
          termination_date: e.termination_date as string | null,
          events: stats.get(e.id as string)?.events ?? 0,
          hours: stats.get(e.id as string)?.hours ?? 0,
        })),
      };
    }
    case "trainings": {
      const f = req.filters;
      const { rows, truncated } = await fetchAll<Record<string, unknown>>((from, to) => {
        let q = supabase
          .from("v_training_list")
          .select("canonical_id, title, event_type_name, status, source_type, format, start_date, end_date, hours, participants, man_hours, organizer, location, actual_tjs")
          .order("start_date", { ascending: false })
          .order("canonical_id", { ascending: false });
        q = f.archived ? q.not("archived_at", "is", null) : q.is("archived_at", null);
        if (f.year) q = q.gte("start_date", `${f.year}-01-01`).lte("start_date", `${f.year}-12-31`);
        if (f.status) q = q.eq("status", f.status);
        if (f.source) q = q.eq("source_type", f.source);
        if (f.q) q = q.or(`title.ilike.%${f.q}%,canonical_id.ilike.%${f.q}%`);
        return q.range(from, to);
      });
      return {
        truncated,
        rows: rows.map((t) => ({
          canonical_id: t.canonical_id as string,
          title: t.title as string,
          event_type: t.event_type_name as string | null,
          status: lab(TRAINING_STATUS_LABELS, t.status),
          source: lab(SOURCE_TYPE_LABELS, t.source_type),
          format: lab(TRAINING_FORMAT_LABELS, t.format),
          start_date: t.start_date as string | null,
          end_date: t.end_date as string | null,
          hours: t.hours as number | null,
          participants: t.participants as number | null,
          man_hours: t.man_hours as number | null,
          organizer: t.organizer as string | null,
          location: t.location as string | null,
          actual_tjs: money ? (t.actual_tjs as number | null) : null,
        })),
      };
    }
    case "exams": {
      const f = req.filters;
      const select = `canonical_id, exam_date, attempt_no, result, score, status, employee:employees(full_name, employee_code), skill:skills(name), provider:learning_providers(name)${money ? ", cost:exam_costs(fee, currency, fee_tjs, funding_source)" : ""}`;
      const { rows, truncated } = await fetchAll<Record<string, unknown>>((from, to) => {
        let q = supabase.from("exams").select(select as "*").is("archived_at", null).order("exam_date", { ascending: false }).order("canonical_id", { ascending: false });
        if (f.employeeId) q = q.eq("employee_id", f.employeeId);
        if (f.result) q = q.eq("result", f.result);
        if (f.year) q = q.gte("exam_date", `${f.year}-01-01`).lte("exam_date", `${f.year}-12-31`);
        return q.range(from, to);
      });
      const needle = f.q.toLowerCase();
      const filtered = needle ? rows.filter((r) => `${emp(r.employee)?.full_name ?? ""} ${name(r.skill) ?? ""} ${r.canonical_id}`.toLowerCase().includes(needle)) : rows;
      return {
        truncated,
        rows: filtered.map((x) => {
          const c = (Array.isArray(x.cost) ? x.cost[0] : x.cost) as { fee: number; currency: string; fee_tjs: number | null; funding_source: string } | null | undefined;
          return {
            canonical_id: x.canonical_id as string,
            employee: emp(x.employee)?.full_name ?? null,
            employee_code: emp(x.employee)?.employee_code ?? null,
            skill: name(x.skill),
            exam_date: x.exam_date as string,
            attempt_no: x.attempt_no as number,
            result: lab(EXAM_RESULT_LABELS, x.result),
            score: x.score as number | null,
            provider: name(x.provider),
            status: lab(EXAM_STATUS_LABELS, x.status),
            fee: money ? (c?.fee ?? null) : null,
            currency: money ? (c?.currency ?? null) : null,
            fee_tjs: money ? (c?.fee_tjs ?? null) : null,
            funding_source: money ? (c?.funding_source ?? null) : null,
          };
        }),
      };
    }
    case "certificates": {
      const f = req.filters;
      const { rows, truncated } = await fetchAll<Record<string, unknown>>((from, to) => {
        let q = supabase
          .from("v_certificates")
          .select("name, cert_type, certificate_number, issuing_organization, issue_date, expiration_date, status, days_left, employee:employees(full_name, employee_code)")
          .is("archived_at", null)
          .order("expiration_date", { ascending: true, nullsFirst: false })
          .order("id");
        if (f.employeeId) q = q.eq("employee_id", f.employeeId);
        if (f.status) q = q.eq("status", f.status);
        return q.range(from, to);
      });
      const needle = f.q.toLowerCase();
      const filtered = needle ? rows.filter((r) => `${emp(r.employee)?.full_name ?? ""} ${r.name ?? ""} ${r.certificate_number ?? ""}`.toLowerCase().includes(needle)) : rows;
      return {
        truncated,
        rows: filtered.map((c) => ({
          name: c.name as string | null,
          cert_type: c.cert_type as string | null,
          employee: emp(c.employee)?.full_name ?? null,
          employee_code: emp(c.employee)?.employee_code ?? null,
          certificate_number: c.certificate_number as string | null,
          issuing_organization: c.issuing_organization as string | null,
          issue_date: c.issue_date as string | null,
          expiration_date: c.expiration_date as string | null,
          status: lab(CERT_STATUS_LABELS, c.status),
          days_left: c.days_left as number | null,
        })),
      };
    }
    case "participants": {
      if (!req.filters.trainingId) throw new ExportInputError("Укажите мероприятие (training_id).");
      const id = req.filters.trainingId;
      const { rows, truncated } = await fetchAll<Record<string, unknown>>((from, to) =>
        supabase
          .from("training_participants")
          .select("attended, result, note, position_snapshot, department_snapshot, unit_snapshot, employee:employees(full_name, employee_code), training:trainings(title, canonical_id)")
          .eq("training_id", id)
          .order("added_at")
          .order("id")
          .range(from, to),
      );
      return {
        truncated,
        rows: rows.map((p) => {
          const t = p.training as { title: string; canonical_id: string } | null;
          return {
            training: t?.title ?? null,
            training_code: t?.canonical_id ?? null,
            employee: emp(p.employee)?.full_name ?? null,
            employee_code: emp(p.employee)?.employee_code ?? null,
            position: p.position_snapshot as string | null,
            department: p.department_snapshot as string | null,
            unit: p.unit_snapshot as string | null,
            attended: p.attended as boolean,
            result: lab(PARTICIPANT_RESULT_LABELS, p.result),
            note: p.note as string | null,
          };
        }),
      };
    }
    case "agreements": {
      const f = req.filters;
      const { rows, truncated } = await fetchAll<Record<string, unknown>>((from, to) => {
        let q = supabase
          .from("learning_agreements")
          .select("canonical_id, status, contract_number, contract_date, total_cost, currency, total_cost_tjs, company_coverage_percent, company_funded_amount, repayment_amount, outcome, effective_from, effective_to, employee:employees(full_name, employee_code)")
          .order("created_at", { ascending: false })
          .order("id");
        if (f.employeeId) q = q.eq("employee_id", f.employeeId);
        if (f.status) q = q.eq("status", f.status);
        return q.range(from, to);
      });
      return {
        truncated,
        rows: rows.map((a) => ({
          canonical_id: a.canonical_id as string,
          employee: emp(a.employee)?.full_name ?? null,
          employee_code: emp(a.employee)?.employee_code ?? null,
          status: lab(AGREEMENT_STATUS_LABELS, a.status),
          contract_number: a.contract_number as string | null,
          contract_date: a.contract_date as string | null,
          total_cost: a.total_cost as number | null,
          currency: a.currency as string | null,
          total_cost_tjs: a.total_cost_tjs as number | null,
          company_coverage_percent: a.company_coverage_percent as number | null,
          company_funded_amount: a.company_funded_amount as number | null,
          repayment_amount: a.repayment_amount as number | null,
          outcome: lab(OUTCOME_LABELS, a.outcome),
          effective_from: a.effective_from as string | null,
          effective_to: a.effective_to as string | null,
        })),
      };
    }
  }
}

/** Ошибка входных параметров выгрузки (текст безопасен для показа). */
export class ExportInputError extends Error {}

export type { ExportEntity };
