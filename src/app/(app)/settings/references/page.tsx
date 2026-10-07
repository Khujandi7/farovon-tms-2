import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { EventTypesManager, type EventTypeRow } from "@/components/references/event-types-manager";
import { OrgUnitsManager, type OrgUnitRow } from "@/components/references/org-units-manager";
import { ProvidersManager, type ProviderRow } from "@/components/references/providers-manager";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Справочники" };
export const dynamic = "force-dynamic";

export default async function ReferencesPage() {
  const session = await requireSession();
  const allowed = session.status === "ok" && can(session.role, "references");
  let rows: OrgUnitRow[] = [];
  let types: EventTypeRow[] = [];
  let providers: ProviderRow[] = [];
  let failed = false;
  let typesFailed = false;
  if (allowed) {
    const supabase = await createClient();
    const [units, emps, ty, pr] = await Promise.all([
      supabase.from("org_units").select("id, name, parent_id, level, is_active").order("name"),
      supabase.from("employees").select("department_id, unit_id").eq("is_active", true).limit(20000),
      supabase.from("learning_event_types").select("id, code, name, is_system, is_group, is_active, sort_order").order("sort_order").order("name"),
      supabase.from("learning_providers").select("id, name, kind, contact, note, is_active").order("name"),
    ]);
    if (units.error) failed = true;
    if (ty.error || pr.error) typesFailed = true;
    const count = new Map<number, number>();
    for (const e of emps.data ?? []) {
      const key = e.unit_id ?? e.department_id;
      if (key !== null) count.set(key, (count.get(key) ?? 0) + 1);
    }
    rows = (units.data ?? []).map((u) => ({ ...u, employees: count.get(u.id) ?? 0 }));
    types = ty.data ?? [];
    providers = pr.data ?? [];
  }
  const role = allowed && session.status === "ok" ? session.role : null;
  return (
    <div className="space-y-8">
      <PageHeader title="Справочники" description="Типы мероприятий, провайдеры и подразделения. Изменения попадают в журнал." />
      {!allowed ? (
        <ForbiddenState className="bg-card" title="Нет доступа" description="Справочники ведут администратор, менеджер академии и HR." />
      ) : (
        <>
          <section aria-labelledby="ref-types" className="space-y-3">
            <h2 id="ref-types" className="text-base font-semibold">Типы мероприятий</h2>
            {typesFailed ? <ErrorState className="bg-card" title="Не удалось загрузить типы и провайдеров" /> : <EventTypesManager types={types} canEdit={can(role, "eventType")} />}
          </section>
          <section aria-labelledby="ref-providers" className="space-y-3">
            <h2 id="ref-providers" className="text-base font-semibold">Провайдеры и организаторы</h2>
            {typesFailed ? null : <ProvidersManager providers={providers} canEdit={can(role, "provider")} />}
          </section>
          <section aria-labelledby="ref-units" className="space-y-3">
            <h2 id="ref-units" className="text-base font-semibold">Подразделения</h2>
            {failed ? <ErrorState className="bg-card" title="Не удалось загрузить справочник" /> : <OrgUnitsManager units={rows} canEdit={can(role, "orgUnits")} />}
          </section>
        </>
      )}
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Настройки
      </Link>
    </div>
  );
}
