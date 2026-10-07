import Link from "next/link";
import { Lock } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/states";
import { NewAgreementDialog } from "@/components/funding/new-agreement-form";
import { Badge } from "@/components/ui/badge";
import { DocumentsPanel } from "@/components/dossier/documents-panel";
import type { AppRole } from "@/lib/auth/roles";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { OBLIGATION_STATUSES, outstandingAmount } from "@/lib/funding/calc";
import { loadAgreementFormOptions, loadEmployeeAgreements } from "@/lib/funding/queries";
import { agreementStatusLabel, agreementStatusVariant } from "@/lib/funding/status";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

/**
 * Вкладка «Договоры»: соглашения о финансировании сотрудника и документы-договоры.
 * Соглашения и договоры видят ADMIN, ACADEMY_MANAGER, FINANCE; HR и VIEWER получают пояснение (RLS всё равно вернёт пусто).
 */
export async function AgreementsTab({ employeeId, role }: { employeeId: string; role: AppRole }) {
  if (!can(role, "fundingRead")) {
    return <EmptyState className="bg-card" icon={Lock} title="Договоры недоступны для вашей роли" description="Соглашения о финансировании и договоры содержат персональные финансовые данные." />;
  }
  const supabase = await createClient();
  const { rows, repaid, error } = await loadEmployeeAgreements(supabase, employeeId);
  const canCreate = can(role, "agreement");
  const [options, emp] = canCreate
    ? await Promise.all([loadAgreementFormOptions(supabase, employeeId), supabase.from("employees").select("full_name").eq("id", employeeId).maybeSingle()])
    : [null, null];

  return (
    <div className="space-y-6" data-testid="agreements-tab">
      <section className="space-y-3" aria-label="Соглашения о финансировании">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Соглашения о финансировании</h3>
          {canCreate && options && <NewAgreementDialog employeeId={employeeId} employeeName={emp?.data?.full_name} options={options} />}
        </div>
        {error ? (
          <ErrorState className="bg-card" title="Не удалось загрузить соглашения" />
        ) : rows.length === 0 ? (
          <EmptyState className="bg-card" compact title="Соглашений пока нет" />
        ) : (
          <ul className="divide-y rounded-xl border bg-card shadow-xs">
            {rows.map((r) => {
              const hasObl = (OBLIGATION_STATUSES as readonly string[]).includes(r.status);
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 px-3 py-3 text-sm" data-testid="agreement-item">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <Link href={`/funding/${r.id}`} className="hover:text-brand hover:underline">{r.canonical_id}</Link>
                      <Badge variant={agreementStatusVariant(r.status)} className="ml-2">{agreementStatusLabel(r.status)}</Badge>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(r.cost_date)} · стоимость {formatMoney(r.total_cost, r.currency)} · компания {formatPercent(r.company_coverage_percent)}
                      {r.contract_number ? ` · договор № ${r.contract_number}` : " · договор не указан"}
                    </p>
                  </div>
                  {hasObl && <p className="text-xs text-muted-foreground">Остаток: <span className="font-medium text-foreground">{formatMoney(outstandingAmount(r.repayment_amount, repaid[r.id] ?? 0), r.currency)}</span></p>}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <DocumentsPanel role={role} scope={{ employeeId }} title="Договоры (документы)" docTypes={["CONTRACT", "AGREEMENT"]} />
    </div>
  );
}

