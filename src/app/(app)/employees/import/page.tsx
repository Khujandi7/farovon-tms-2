import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/states";
import { ImportWizard } from "@/components/imports/import-wizard";
import { getSectionAccess } from "@/lib/auth/session";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Импорт сотрудников" };
export const dynamic = "force-dynamic";

export default async function EmployeesImportPage() {
  const access = await getSectionAccess("employees");
  const crumbs = [{ label: "Сотрудники", href: "/employees" }, { label: "Импорт" }];
  const ok = access.allowed && can(access.session.role, "importEmployees");
  return (
    <div className="space-y-6">
      <PageHeader title="Импорт сотрудников" description="Загрузка справочника из Excel или CSV: новые сотрудники создаются, существующие обновляются." breadcrumbs={crumbs} backHref="/employees" backLabel="К сотрудникам" />
      {ok ? <ImportWizard entities={["EMPLOYEES"]} initialEntity="EMPLOYEES" /> : <ForbiddenState className="bg-card" />}
    </div>
  );
}
