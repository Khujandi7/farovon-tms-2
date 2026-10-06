import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { OrgUnitsManager, type OrgUnitRow } from "@/components/references/org-units-manager";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Справочники" };
export const dynamic = "force-dynamic";

export default async function ReferencesPage() {
  const session = await requireSession();
  const allowed = session.status === "ok" && can(session.role, "references");
  let rows: OrgUnitRow[] = [];
  let failed = false;
  if (allowed) {
    const supabase = await createClient();
    const [units, emps] = await Promise.all([supabase.from("org_units").select("id, name, parent_id, level, is_active").order("name"), supabase.from("employees").select("department_id, unit_id").eq("is_active", true).limit(20000)]);
    if (units.error) failed = true;
    const count = new Map<number, number>();
    for (const e of emps.data ?? []) {
      const key = e.unit_id ?? e.department_id;
      if (key !== null) count.set(key, (count.get(key) ?? 0) + 1);
    }
    rows = (units.data ?? []).map((u) => ({ ...u, employees: count.get(u.id) ?? 0 }));
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Справочники" description="Подразделения: департаменты и отделы. Изменения попадают в журнал." />
      {!allowed ? <ForbiddenState className="bg-card" title="Нет доступа" description="Справочники ведут администратор, менеджер академии и HR." /> : failed ? <ErrorState className="bg-card" title="Не удалось загрузить справочник" /> : <OrgUnitsManager units={rows} canEdit />}
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Настройки
      </Link>
    </div>
  );
}
