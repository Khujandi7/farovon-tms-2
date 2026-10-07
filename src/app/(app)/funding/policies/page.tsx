import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { PoliciesManager, type PolicyRow } from "@/components/funding/policies-manager";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Политики финансирования" };
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "funding")) return <ForbiddenState className="bg-card" />;
  const supabase = await createClient();
  const [pol, out] = await Promise.all([
    supabase.from("funding_policies").select("id, name, scope, company_coverage_percent, currency, effective_from, effective_to, basis, is_active, confirmed_at").order("effective_from", { ascending: false }).order("created_at", { ascending: false }),
    supabase.from("funding_policy_outcomes").select("policy_id, outcome, employee_responsibility_percent"),
  ]);
  const byPolicy = new Map<string, Record<string, number>>();
  for (const o of out.data ?? []) byPolicy.set(o.policy_id, { ...(byPolicy.get(o.policy_id) ?? {}), [o.outcome]: o.employee_responsibility_percent });
  const rows: PolicyRow[] = (pol.data ?? []).map((p) => ({ ...p, outcomes: byPolicy.get(p.id) ?? {} }));

  return (
    <div className="space-y-5">
      <PageHeader title="Политики финансирования" description="Правила: доля компании и ответственность сотрудника по результату" backHref="/funding" backLabel="К соглашениям" />
      {pol.error ? <ErrorState className="bg-card" title="Не удалось загрузить политики" /> : <PoliciesManager policies={rows} canWrite={can(session.role, "fundingPolicy")} />}
    </div>
  );
}
