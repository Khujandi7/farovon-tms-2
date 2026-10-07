import { formatDate, formatMoney } from "@/lib/format";
import { agreementStatusLabel, outcomeLabel } from "./status";

/** Подписи для журнала соглашений, политик, погашений и документов (общий labels.ts не меняем). */
export const FUNDING_TABLE_LABELS: Record<string, string> = {
  learning_agreements: "Соглашение",
  funding_policies: "Политика",
  agreement_repayments: "Погашение",
  documents: "Документ",
};

export const FUNDING_FIELD_LABELS: Record<string, string> = {
  status: "Статус",
  outcome: "Результат",
  total_cost: "Стоимость",
  currency: "Валюта",
  cost_date: "Дата расходов",
  company_coverage_percent: "Доля компании, %",
  company_funded_amount: "Оплатила компания",
  employee_responsibility_percent: "Ответственность сотрудника, %",
  repayment_amount: "Сумма обязательства",
  contract_number: "Номер договора",
  contract_date: "Дата договора",
  contract_document_id: "Файл договора",
  conditions: "Условия",
  pass_condition: "Условие успеха",
  fail_condition: "Условие неудачи",
  note: "Примечание",
  review_note: "Заметка проверки",
  reviewed_at: "Проверено",
  evaluated_at: "Рассчитано",
  effective_from: "Действует с",
  effective_to: "Действует по",
  amount: "Сумма",
  paid_on: "Дата платежа",
  comment: "Комментарий",
  voided_at: "Аннулировано",
  void_reason: "Причина аннулирования",
  policy_id: "Политика",
  name: "Название",
  scope: "Область",
  basis: "Основание",
  confirmed_at: "Подтверждена",
  is_active: "Активна",
  title: "Название",
  archived_at: "В архиве",
  archive_reason: "Причина архивации",
  expires_on: "Срок действия",
};

const HIDDEN = new Set(["id", "created_at", "created_by", "updated_at", "updated_by", "evaluated_by", "reviewed_by", "confirmed_by", "archived_by", "fx_rate", "fx_date", "total_cost_tjs", "canonical_id", "storage_path", "uploaded_by", "uploaded_at"]);

function fmtValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (field === "status" && typeof v === "string") return agreementStatusLabel(v);
  if (field === "outcome" && typeof v === "string") return outcomeLabel(v);
  if (typeof v === "boolean") return v ? "Да" : "Нет";
  if ((field === "total_cost" || field === "amount" || field === "repayment_amount" || field === "company_funded_amount") && typeof v === "number") return formatMoney(v, "");
  if (/_at$/.test(field) && typeof v === "string") return formatDate(v.slice(0, 10));
  if (/_date$/.test(field) || field === "paid_on" || field === "expires_on" || field.startsWith("effective_")) return formatDate(String(v));
  return String(v);
}

export type FundingAuditRow = {
  id: number;
  at: string;
  user_name: string | null;
  table_name: string;
  action: string;
  reason: string | null;
  changes: Record<string, unknown> | null;
  new_row: Record<string, unknown> | null;
  old_row: Record<string, unknown> | null;
};

export type FundingAuditView = { title: string; lines: { field: string; label: string; before: string; after: string }[] };

export function describeFundingAudit(row: FundingAuditRow): FundingAuditView {
  const noun = FUNDING_TABLE_LABELS[row.table_name] ?? row.table_name;
  const lines: FundingAuditView["lines"] = [];
  const push = (field: string, before: unknown, after: unknown) => {
    if (HIDDEN.has(field)) return;
    lines.push({ field, label: FUNDING_FIELD_LABELS[field] ?? field, before: fmtValue(field, before), after: fmtValue(field, after) });
  };
  if (row.action === "UPDATE") {
    for (const [field, pair] of Object.entries((row.changes ?? {}) as Record<string, unknown>)) if (Array.isArray(pair)) push(field, pair[0], pair[1]);
    return { title: `${noun}: изменено`, lines };
  }
  if (row.action === "INSERT") {
    for (const [k, v] of Object.entries(row.new_row ?? {})) if (v !== null && v !== "") push(k, null, v);
    return { title: `${noun}: добавлено`, lines: lines.slice(0, 8) };
  }
  for (const [k, v] of Object.entries(row.old_row ?? {})) if (v !== null && v !== "") push(k, v, null);
  return { title: `${noun}: удалено`, lines: lines.slice(0, 8) };
}
