/**
 * Чистая логика финансирования. Деньги в БД считают триггеры и RPC; здесь — только отображение и предварительная оценка
 * (доли для подсказки в форме, сводка по странице, остаток). Никакого удержания зарплаты и payroll.
 */

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export const LEGAL_WARNING = "Требуется проверка ответственным сотрудником (юридические ограничения)";
export const LEGAL_WARNING_DETAIL =
  "Система не удерживает деньги из зарплаты и не связана с payroll: она только рассчитывает обязательство по подтверждённой политике и договору. Решение о взыскании принимает ответственный сотрудник с учётом законодательства.";

export type Shares = { company: number; employee: number; companyPercent: number; employeePercent: number };

/** Доли компании и сотрудника по стоимости и проценту покрытия компанией (как в триггере БД: round(total * pct / 100, 2)). */
export function computeShares(totalCost: number, companyPercent: number): Shares | null {
  if (!Number.isFinite(totalCost) || !Number.isFinite(companyPercent) || totalCost < 0 || companyPercent < 0 || companyPercent > 100) return null;
  const company = round2((totalCost * companyPercent) / 100);
  return { company, employee: round2(totalCost - company), companyPercent, employeePercent: round2(100 - companyPercent) };
}

/** Обязательство сотрудника по исходу: round(total * pct / 100, 2) (как evaluate_agreement). */
export function obligationAmount(totalCost: number, responsibilityPercent: number): number | null {
  if (!Number.isFinite(totalCost) || !Number.isFinite(responsibilityPercent) || totalCost < 0 || responsibilityPercent < 0 || responsibilityPercent > 100) return null;
  return round2((totalCost * responsibilityPercent) / 100);
}

export const OBLIGATION_STATUSES = ["OBLIGATION_CREATED", "PARTIALLY_REPAID", "REPAID"] as const;

export function outstandingAmount(repaymentAmount: number, repaid: number): number {
  return Math.max(0, round2(repaymentAmount - repaid));
}

/** Пересчёт суммы в TJS по отношению total_cost_tjs / total_cost, зафиксированному в соглашении. */
export function toTjs(amount: number, totalCost: number, totalCostTjs: number | null): number | null {
  if (totalCostTjs === null || totalCostTjs === undefined) return null;
  if (!totalCost) return round2(totalCostTjs === 0 ? 0 : amount);
  return round2((amount * totalCostTjs) / totalCost);
}

export type AgreementMoneyRow = {
  status: string;
  total_cost: number;
  total_cost_tjs: number | null;
  company_funded_amount: number;
  repayment_amount: number;
};

export type FundingTotals = { totalTjs: number; companyTjs: number; employeeTjs: number; outstandingTjs: number; count: number; skipped: number };

/** Сводка по реестру в TJS. Отменённые не учитываются; строки без курса пропускаются и считаются в `skipped`. */
export function summarizeAgreements<T extends AgreementMoneyRow & { id: string }>(rows: T[], repaidById: Record<string, number>): FundingTotals {
  const t: FundingTotals = { totalTjs: 0, companyTjs: 0, employeeTjs: 0, outstandingTjs: 0, count: 0, skipped: 0 };
  for (const r of rows) {
    if (r.status === "CANCELLED") continue;
    const total = r.total_cost_tjs;
    if (total === null || total === undefined) {
      t.skipped += 1;
      continue;
    }
    const company = toTjs(r.company_funded_amount, r.total_cost, total) ?? 0;
    t.count += 1;
    t.totalTjs += total;
    t.companyTjs += company;
    t.employeeTjs += total - company;
    if ((OBLIGATION_STATUSES as readonly string[]).includes(r.status)) {
      t.outstandingTjs += toTjs(outstandingAmount(r.repayment_amount, repaidById[r.id] ?? 0), r.total_cost, total) ?? 0;
    }
  }
  return { ...t, totalTjs: round2(t.totalTjs), companyTjs: round2(t.companyTjs), employeeTjs: round2(t.employeeTjs), outstandingTjs: round2(t.outstandingTjs) };
}

/** Валидация суммы погашения до отправки (БД проверяет то же самое). */
export function validateRepayment(amount: number, outstanding: number): string | null {
  if (!Number.isFinite(amount) || amount <= 0) return "Сумма должна быть больше 0.";
  if (round2(amount) > round2(outstanding)) return `Сумма не может превышать остаток (${outstanding}).`;
  return null;
}
