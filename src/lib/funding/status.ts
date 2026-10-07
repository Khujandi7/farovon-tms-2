import type { AppRole } from "@/lib/auth/roles";
import { can } from "@/lib/workflows/roles";

export const AGREEMENT_STATUSES = ["ACTIVE", "COMPLETED", "OBLIGATION_CREATED", "PARTIALLY_REPAID", "REPAID", "CANCELLED"] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

export const AGREEMENT_STATUS_LABELS: Record<AgreementStatus, string> = {
  ACTIVE: "Действует",
  COMPLETED: "Завершено без обязательства",
  OBLIGATION_CREATED: "Обязательство создано",
  PARTIALLY_REPAID: "Погашено частично",
  REPAID: "Погашено",
  CANCELLED: "Отменено",
};

type Variant = "success" | "brand" | "secondary" | "warning" | "outline";
export const AGREEMENT_STATUS_VARIANT: Record<AgreementStatus, Variant> = {
  ACTIVE: "brand",
  COMPLETED: "success",
  OBLIGATION_CREATED: "warning",
  PARTIALLY_REPAID: "warning",
  REPAID: "success",
  CANCELLED: "outline",
};

export const isAgreementStatus = (v: unknown): v is AgreementStatus => typeof v === "string" && (AGREEMENT_STATUSES as readonly string[]).includes(v);

export function agreementStatusLabel(status: string): string {
  return isAgreementStatus(status) ? AGREEMENT_STATUS_LABELS[status] : status;
}
export function agreementStatusVariant(status: string): Variant {
  return isAgreementStatus(status) ? AGREEMENT_STATUS_VARIANT[status] : "secondary";
}

export const OUTCOME_LABELS: Record<string, string> = {
  PASSED: "Сдан / успешно",
  FAILED: "Не сдан",
  NOT_ATTENDED: "Не явился",
  NOT_COMPLETED: "Не завершил",
  COMPLETED: "Завершил",
  OTHER: "Другое",
  PENDING: "Результат не внесён",
};
export const POLICY_OUTCOMES = ["PASSED", "FAILED", "NOT_ATTENDED", "NOT_COMPLETED", "COMPLETED", "OTHER"] as const;
export const outcomeLabel = (o: string | null | undefined): string => (o ? (OUTCOME_LABELS[o] ?? o) : "—");

export const POLICY_SCOPE_LABELS: Record<string, string> = { ANY: "Любое обучение", EXAM: "Экзамен", INDIVIDUAL_EDUCATION: "Индивидуальное обучение" };

export type PolicyState = "DRAFT" | "CONFIRMED" | "DISABLED";
export function policyState(p: { confirmed_at: string | null; is_active: boolean }): PolicyState {
  if (!p.is_active) return "DISABLED";
  return p.confirmed_at ? "CONFIRMED" : "DRAFT";
}
export const POLICY_STATE_LABELS: Record<PolicyState, string> = { DRAFT: "Черновик", CONFIRMED: "Подтверждена", DISABLED: "Отключена" };

export type StepState = "done" | "current" | "todo" | "skipped";
export type Step = { key: string; label: string; state: StepState };

type StepInput = { status: string; evaluated_at: string | null; reviewed_at: string | null; repayment_amount: number };

/** Статус-линия: Договор -> Расчёт -> Проверка -> Погашение. */
export function agreementSteps(a: StepInput): Step[] {
  if (a.status === "CANCELLED") return [{ key: "cancelled", label: "Соглашение отменено", state: "skipped" }];
  const evaluated = !!a.evaluated_at;
  const hasObligation = a.repayment_amount > 0 && evaluated;
  const reviewed = !!a.reviewed_at;
  const repaid = a.status === "REPAID";
  const steps: Step[] = [
    { key: "created", label: "Соглашение", state: "done" },
    { key: "evaluated", label: "Расчёт по результату", state: evaluated ? "done" : "current" },
  ];
  if (evaluated && !hasObligation) {
    steps.push({ key: "review", label: "Проверка", state: "skipped" }, { key: "repay", label: "Погашение", state: "skipped" });
    return steps;
  }
  steps.push({ key: "review", label: "Проверка ответственным", state: reviewed ? "done" : evaluated ? "current" : "todo" });
  steps.push({ key: "repay", label: "Погашение", state: repaid ? "done" : reviewed ? "current" : "todo" });
  return steps;
}

export type AgreementActionInput = { status: string; reviewed_at: string | null; evaluated_at: string | null; repayment_amount: number };
export type AgreementActions = { edit: boolean; evaluate: boolean; review: boolean; record: boolean; void: boolean; cancel: boolean };

/** Какие кнопки показывать. Повторяет проверки RPC; настоящая защита — в БД. */
export function agreementActions(a: AgreementActionInput, role: AppRole | null | undefined, activeRepayments: number, outstanding: number): AgreementActions {
  const open = a.status !== "CANCELLED";
  const hasRepayments = activeRepayments > 0;
  return {
    edit: open && can(role, "agreement"),
    evaluate: open && can(role, "agreement") && !hasRepayments,
    review: open && can(role, "agreementFinance") && ["OBLIGATION_CREATED", "PARTIALLY_REPAID", "REPAID"].includes(a.status) && !a.reviewed_at,
    record: open && can(role, "agreementFinance") && ["OBLIGATION_CREATED", "PARTIALLY_REPAID"].includes(a.status) && !!a.reviewed_at && outstanding > 0,
    void: open && can(role, "agreementFinance") && hasRepayments,
    cancel: open && can(role, "agreementFinance"),
  };
}
