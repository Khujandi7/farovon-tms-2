import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type Client = SupabaseClient<Database>;

export type TargetOption = { id: string; label: string };
export type PolicyOption = { id: string; name: string; company_coverage_percent: number; scope: string; effective_from: string; effective_to: string | null; currency: string | null };
export type AgreementFormOptions = { trainings: TargetOption[]; exams: TargetOption[]; policies: PolicyOption[] };

/** Варианты для формы соглашения: обучения и экзамены сотрудника, подтверждённые активные политики. Всё под сессией пользователя (RLS). */
export async function loadAgreementFormOptions(supabase: Client, employeeId: string): Promise<AgreementFormOptions> {
  const [parts, exams, policies] = await Promise.all([
    supabase.from("training_participants").select("training_id, trainings(id, title, start_date)").eq("employee_id", employeeId).limit(300),
    supabase.from("exams").select("id, canonical_id, exam_date, skills(name)").eq("employee_id", employeeId).is("archived_at", null).order("exam_date", { ascending: false }).limit(200),
    supabase
      .from("funding_policies")
      .select("id, name, company_coverage_percent, scope, effective_from, effective_to, currency")
      .eq("is_active", true)
      .not("confirmed_at", "is", null)
      .order("effective_from", { ascending: false }),
  ]);
  const seen = new Set<string>();
  const trainings: TargetOption[] = [];
  for (const p of parts.data ?? []) {
    const t = Array.isArray(p.trainings) ? p.trainings[0] : p.trainings;
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    trainings.push({ id: t.id, label: `${t.title} (${t.start_date})` });
  }
  return {
    trainings,
    exams: (exams.data ?? []).map((e) => {
      const s = Array.isArray(e.skills) ? e.skills[0] : e.skills;
      return { id: e.id, label: `${e.canonical_id}${s?.name ? ` · ${s.name}` : ""} (${e.exam_date})` };
    }),
    policies: policies.data ?? [],
  };
}

export type EmployeeAgreementRow = {
  id: string;
  canonical_id: string;
  status: string;
  total_cost: number;
  currency: string;
  total_cost_tjs: number | null;
  company_coverage_percent: number;
  company_funded_amount: number;
  repayment_amount: number;
  cost_date: string;
  reviewed_at: string | null;
  training_id: string | null;
  exam_id: string | null;
  contract_number: string | null;
};

/** Соглашения сотрудника и сумма действующих (неаннулированных) погашений по каждому. Пусто, если роль не читает соглашения (RLS). */
export async function loadEmployeeAgreements(supabase: Client, employeeId: string): Promise<{ rows: EmployeeAgreementRow[]; repaid: Record<string, number>; error: boolean }> {
  const { data, error } = await supabase
    .from("learning_agreements")
    .select("id, canonical_id, status, total_cost, currency, total_cost_tjs, company_coverage_percent, company_funded_amount, repayment_amount, cost_date, reviewed_at, training_id, exam_id, contract_number")
    .eq("employee_id", employeeId)
    .order("cost_date", { ascending: false })
    .limit(200);
  const rows = data ?? [];
  const repaid: Record<string, number> = {};
  if (rows.length) {
    const { data: reps } = await supabase.from("agreement_repayments").select("agreement_id, amount").in("agreement_id", rows.map((r) => r.id)).is("voided_at", null);
    for (const r of reps ?? []) repaid[r.agreement_id] = (repaid[r.agreement_id] ?? 0) + r.amount;
  }
  return { rows, repaid, error: !!error };
}
