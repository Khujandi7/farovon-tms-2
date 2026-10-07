import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { AgreementActionsBar } from "@/components/funding/agreement-actions";
import { FundingAudit } from "@/components/funding/funding-audit";
import { LegalWarning } from "@/components/funding/legal-warning";
import { RepaymentsPanel, type RepaymentRow } from "@/components/funding/repayments-panel";
import { StatusLine } from "@/components/funding/status-line";
import { DocumentsPanel } from "@/components/dossier/documents-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { computeShares, OBLIGATION_STATUSES, outstandingAmount } from "@/lib/funding/calc";
import type { FundingAuditRow } from "@/lib/funding/audit";
import { agreementActions, agreementStatusLabel, agreementStatusVariant, outcomeLabel } from "@/lib/funding/status";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Соглашение" };
export const dynamic = "force-dynamic";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function Item({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words tabular-nums" data-testid={testId}>{children}</dd>
    </div>
  );
}

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "funding")) return <ForbiddenState className="bg-card" />;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: a } = await supabase.from("learning_agreements").select("*").eq("id", id).maybeSingle();
  if (!a) notFound();

  const [emp, training, exam, policy, outcomes, repayments, contractDocs, audit] = await Promise.all([
    supabase.from("employees").select("id, full_name, canonical_id").eq("id", a.employee_id).maybeSingle(),
    a.training_id ? supabase.from("trainings").select("id, title").eq("id", a.training_id).maybeSingle() : Promise.resolve({ data: null }),
    a.exam_id ? supabase.from("exams").select("id, canonical_id").eq("id", a.exam_id).maybeSingle() : Promise.resolve({ data: null }),
    a.policy_id ? supabase.from("funding_policies").select("id, name, confirmed_at, is_active").eq("id", a.policy_id).maybeSingle() : Promise.resolve({ data: null }),
    a.policy_id ? supabase.from("funding_policy_outcomes").select("outcome, employee_responsibility_percent").eq("policy_id", a.policy_id) : Promise.resolve({ data: [] as { outcome: string; employee_responsibility_percent: number }[] }),
    supabase.from("agreement_repayments").select("id, amount, paid_on, comment, voided_at, void_reason, created_by").eq("agreement_id", id).order("paid_on", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("documents").select("id, title").or(`agreement_id.eq.${id},employee_id.eq.${a.employee_id}`).in("doc_type", ["CONTRACT", "AGREEMENT"]).eq("status", "UPLOADED").is("archived_at", null),
    supabase.rpc("entity_audit", { p_table: "learning_agreements", p_id: id, p_limit: 100 }),
  ]);

  const people = [...new Set([a.evaluated_by, a.reviewed_by, ...(repayments.data ?? []).map((r) => r.created_by)].filter((x): x is string => !!x))];
  const { data: profiles } = people.length ? await supabase.from("profiles").select("id, full_name").in("id", people) : { data: [] as { id: string; full_name: string }[] };
  const nameOf = (uid: string | null) => (uid ? ((profiles ?? []).find((p) => p.id === uid)?.full_name ?? null) : null);

  const reps: RepaymentRow[] = (repayments.data ?? []).map((r) => ({ id: r.id, amount: r.amount, paid_on: r.paid_on, comment: r.comment, voided_at: r.voided_at, void_reason: r.void_reason, created_by_name: nameOf(r.created_by) }));
  const active = reps.filter((r) => !r.voided_at);
  const repaid = active.reduce((s, r) => s + r.amount, 0);
  const hasObligationStatus = (OBLIGATION_STATUSES as readonly string[]).includes(a.status);
  const outstanding = hasObligationStatus ? outstandingAmount(a.repayment_amount, repaid) : 0;
  const shares = computeShares(a.total_cost, a.company_coverage_percent);
  const actions = agreementActions(a, session.role, active.length, outstanding);
  const canVoid = can(session.role, "agreementFinance") && a.status !== "CANCELLED";
  const policyOutcomes = [...(outcomes.data ?? [])];
  const auditRows = (audit.data ?? []) as unknown as FundingAuditRow[];
  const target = training.data ? <Link href={`/trainings/${training.data.id}`} className="hover:text-brand hover:underline">{training.data.title}</Link> : exam.data ? `Экзамен ${exam.data.canonical_id}` : "—";
  const needsReview = hasObligationStatus && a.repayment_amount > 0 && !a.reviewed_at;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Соглашение ${a.canonical_id}`}
        description={emp.data ? emp.data.full_name : undefined}
        backHref="/funding"
        backLabel="К реестру"
        actions={<Badge variant={agreementStatusVariant(a.status)} data-testid="agreement-status">{agreementStatusLabel(a.status)}</Badge>}
      />

      <StatusLine agreement={a} />

      {(needsReview || actions.evaluate) && <LegalWarning />}

      <AgreementActionsBar
        id={a.id}
        actions={actions}
        currency={a.currency}
        outstanding={outstanding}
        contractDocs={contractDocs.data ?? []}
        hasObligation={!!a.evaluated_at}
        defaults={{ contract_number: a.contract_number, contract_date: a.contract_date, contract_document_id: a.contract_document_id, conditions: a.conditions, pass_condition: a.pass_condition, fail_condition: a.fail_condition, note: a.note }}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Расчёт</CardTitle>
            <CardDescription>Доли фиксируются при создании; обязательство считается по результату и подтверждённой политике.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2" data-testid="calc">
              <Item label="Сотрудник">{emp.data ? <Link href={`/employees/${emp.data.id}`} className="hover:text-brand hover:underline">{emp.data.full_name}</Link> : "—"}</Item>
              <Item label="Предмет">{target}</Item>
              <Item label="Стоимость" testId="calc-total">
                {formatMoney(a.total_cost, a.currency)}
                {a.currency !== "TJS" && a.total_cost_tjs !== null && <span className="block text-xs font-normal text-muted-foreground">≈ {formatMoney(a.total_cost_tjs)} · курс {a.fx_rate ?? "—"} на {formatDate(a.fx_date)}</span>}
              </Item>
              <Item label="Дата расходов">{formatDate(a.cost_date)}</Item>
              <Item label={`Компания оплачивает (${formatPercent(a.company_coverage_percent)})`} testId="calc-company">{formatMoney(a.company_funded_amount, a.currency)}</Item>
              <Item label={`Сотрудник оплачивает (${formatPercent(shares?.employeePercent)})`} testId="calc-employee">{shares ? formatMoney(shares.employee, a.currency) : "—"}</Item>
              <Item label="Политика">
                {policy.data ? <Link href="/funding/policies" className="hover:text-brand hover:underline">{policy.data.name}</Link> : "Не выбрана"}
                {policy.data && !policy.data.confirmed_at && <span className="block text-xs font-normal text-warning">Политика не подтверждена</span>}
              </Item>
              <Item label="Результат">{a.evaluated_at ? outcomeLabel(a.outcome) : "Не рассчитан"}</Item>
              <Item label="Ответственность сотрудника по результату">{a.evaluated_at ? formatPercent(a.employee_responsibility_percent) : "—"}</Item>
              <Item label="Сумма обязательства" testId="calc-obligation">{a.evaluated_at ? formatMoney(a.repayment_amount, a.currency) : "—"}</Item>
              <Item label="Погашено">{hasObligationStatus ? formatMoney(repaid, a.currency) : "—"}</Item>
              <Item label="Остаток" testId="calc-outstanding">{hasObligationStatus ? formatMoney(outstanding, a.currency) : "—"}</Item>
            </dl>
            {policyOutcomes.length > 0 && (
              <p className="mt-4 text-xs text-muted-foreground">
                Правила политики: {policyOutcomes.map((o) => `${outcomeLabel(o.outcome)} — ${formatPercent(o.employee_responsibility_percent)}`).join("; ")}.
              </p>
            )}
            {a.evaluated_at && (
              <p className="mt-2 text-xs text-muted-foreground">
                Рассчитано {formatDate(a.evaluated_at.slice(0, 10))}{nameOf(a.evaluated_by) ? `, ${nameOf(a.evaluated_by)}` : ""}.
                {a.reviewed_at ? ` Проверено ${formatDate(a.reviewed_at.slice(0, 10))}${nameOf(a.reviewed_by) ? `, ${nameOf(a.reviewed_by)}` : ""}${a.review_note ? `: ${a.review_note}` : ""}.` : ""}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Договор</CardTitle>
            <CardDescription>Без номера или файла договора расчёт обязательства невозможен.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              <Item label="Номер">{a.contract_number ?? "—"}</Item>
              <Item label="Дата">{formatDate(a.contract_date)}</Item>
              <Item label="Файл">{a.contract_document_id ? (contractDocs.data ?? []).find((d) => d.id === a.contract_document_id)?.title ?? "Прикреплён" : "Не прикреплён"}</Item>
              {a.conditions && <Item label="Условия">{a.conditions}</Item>}
              {a.pass_condition && <Item label="Условие успеха">{a.pass_condition}</Item>}
              {a.fail_condition && <Item label="Условие неудачи">{a.fail_condition}</Item>}
              {a.note && <Item label="Примечание">{a.note}</Item>}
            </dl>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="ag-docs" className="space-y-3">
        <h2 id="ag-docs" className="sr-only">Документы соглашения</h2>
        <DocumentsPanel role={session.role} scope={{ agreementId: a.id, employeeId: a.employee_id }} title="Документы соглашения" docTypes={["CONTRACT", "AGREEMENT", "INVOICE", "ACT", "PAYMENT_DOCUMENT"]} />
      </section>

      <section aria-labelledby="ag-rep" className="space-y-3">
        <h2 id="ag-rep" className="text-base font-semibold">История погашений</h2>
        {repayments.error ? <ErrorState className="bg-card" title="Не удалось загрузить погашения" /> : <RepaymentsPanel agreementId={a.id} currency={a.currency} rows={reps} canVoid={canVoid} />}
      </section>

      <section aria-labelledby="ag-audit" className="space-y-3">
        <h2 id="ag-audit" className="text-base font-semibold">История изменений</h2>
        {audit.error ? <ErrorState className="bg-card" title="Не удалось загрузить историю" /> : <FundingAudit rows={auditRows} />}
      </section>
    </div>
  );
}
