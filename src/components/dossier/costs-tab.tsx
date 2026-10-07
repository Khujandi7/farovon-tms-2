import { Lock } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/states";
import type { AppRole } from "@/lib/auth/roles";
import { formatMoney, formatPercent } from "@/lib/format";
import { round2, summarizeAgreements } from "@/lib/funding/calc";
import { loadEmployeeAgreements } from "@/lib/funding/queries";
import { createClient } from "@/lib/supabase/server";

function Stat({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-xs">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums" data-testid={testId}>{value}</dd>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Вкладка «Затраты». Деньги видят ADMIN, ACADEMY_MANAGER, FINANCE. Для HR и VIEWER запросы денег не выполняются.
 * Итоги компании и обязательства берутся из employee_learning_summary (считает БД); доли по соглашениям — из самих соглашений.
 */
export async function CostsTab({ employeeId, role }: { employeeId: string; role: AppRole }) {
  if (role !== "ADMIN" && role !== "ACADEMY_MANAGER" && role !== "FINANCE") {
    return <EmptyState className="bg-card" icon={Lock} title="Суммы недоступны для вашей роли" description="Затраты на обучение и обязательства сотрудника видят только ответственные за финансы." />;
  }
  const supabase = await createClient();
  const [summaryRes, ag] = await Promise.all([supabase.rpc("employee_learning_summary", { p_employee: employeeId }), loadEmployeeAgreements(supabase, employeeId)]);
  if (summaryRes.error || ag.error) return <ErrorState className="bg-card" title="Не удалось загрузить затраты" description="Попробуйте обновить страницу." />;
  const s = summaryRes.data?.[0];
  const totals = summarizeAgreements(ag.rows, ag.repaid);
  const companyPct = totals.totalTjs > 0 ? round2((totals.companyTjs / totals.totalTjs) * 100) : null;
  const employeePct = companyPct === null ? null : round2(100 - companyPct);
  const tjs = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatMoney(v));

  return (
    <div className="space-y-4" data-testid="costs-tab">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Company funded (расходы компании)" value={tjs(s?.company_spent_tjs)} hint="Мероприятия и экзамены, оплаченные компанией" testId="cost-company" />
        <Stat label="Индивидуальное обучение" value={tjs(s?.individual_education_tjs)} hint="Не групповые мероприятия" />
        <Stat label="Employee funded (доля сотрудника по соглашениям)" value={tjs(totals.employeeTjs)} hint={employeePct === null ? undefined : `${formatPercent(employeePct)} от стоимости по соглашениям`} testId="cost-employee" />
        <Stat label="Оплатила компания по соглашениям" value={tjs(totals.companyTjs)} hint={companyPct === null ? undefined : `${formatPercent(companyPct)} от стоимости`} />
        <Stat label="Обязательство сотрудника" value={tjs(s?.employee_obligation_tjs)} hint="По результатам, после расчёта" />
        <Stat label="Outstanding obligation (непогашено)" value={tjs(s?.outstanding_obligation_tjs)} hint="Обязательство минус действующие погашения" testId="cost-outstanding" />
      </dl>
      {totals.skipped > 0 && <p className="text-xs text-muted-foreground">Соглашений без курса в TJS: {totals.skipped} — в доли по соглашениям не вошли.</p>}
      <p className="text-xs text-muted-foreground">Суммы в TJS по курсам на дату расходов. Система не удерживает деньги из зарплаты: обязательство требует проверки ответственным сотрудником.</p>
    </div>
  );
}
