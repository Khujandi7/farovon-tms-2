import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Upload, Users } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { EmployeeFilters } from "@/components/employees/employee-filters";
import { EmployeesTable, type EmployeeRow, type SortHeader } from "@/components/employees/employees-table";
import { NewEmployeeDialog } from "@/components/employees/new-employee-dialog";
import { ExportButton } from "@/components/export/export-button";
import { Button } from "@/components/ui/button";
import { employeeExportParams, employeeListQuery, EMPLOYEE_PAGE_SIZE, parseEmployeeListParams, type EmployeeSort } from "@/lib/employees/list-params";
import { applyEmployeeFilters, applyEmployeeSort, EMPLOYEE_SELECT, employeesWithOpenRemarks, fetchEmployeeStats } from "@/lib/employees/query";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Сотрудники" };
export const dynamic = "force-dynamic";

const HEADERS: { key: EmployeeSort; label: string }[] = [
  { key: "name", label: "ФИО" },
  { key: "code", label: "Табельный №" },
  { key: "position", label: "Должность" },
  { key: "status", label: "Статус" },
];
const name = (v: unknown) => (v as { name: string } | null)?.name ?? null;

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseEmployeeListParams(await searchParams);

  return (
    <SectionPage section="employees">
      {async (session) => {
        const supabase = await createClient();
        const canEdit = can(session.role, "employee");
        const canSeeRemarks = session.role !== "VIEWER";
        const remarkIds = p.remarks && canSeeRemarks ? await employeesWithOpenRemarks(supabase) : [];
        const base = supabase.from("employees").select(EMPLOYEE_SELECT, { count: "exact" });
        const req = applyEmployeeSort(applyEmployeeFilters(base, { ...p, remarks: p.remarks && canSeeRemarks }, remarkIds), p).range((p.page - 1) * EMPLOYEE_PAGE_SIZE, p.page * EMPLOYEE_PAGE_SIZE - 1);
        const [{ data, error, count }, { data: orgs }] = await Promise.all([req, supabase.from("org_units").select("id, name, parent_id, level").eq("is_active", true).order("name")]);
        const orgUnits = (orgs ?? []).map((u) => ({ id: u.id, name: u.name, parent_id: u.parent_id, level: u.level }));
        const total = count ?? 0;
        const pages = Math.max(1, Math.ceil(total / EMPLOYEE_PAGE_SIZE));
        const ids = (data ?? []).map((e) => e.id);
        const [stats, remarks] = await Promise.all([
          fetchEmployeeStats(supabase, ids),
          canSeeRemarks && ids.length
            ? supabase.from("dq_issues").select("entity_id").eq("entity_table", "employees").eq("status", "OPEN").in("entity_id", ids)
            : Promise.resolve({ data: [] as { entity_id: string | null }[] }),
        ]);
        const withRemarks = new Set((remarks.data ?? []).map((r) => r.entity_id));
        const rows: EmployeeRow[] = (data ?? []).map((e) => ({
          id: e.id,
          employee_code: e.employee_code,
          canonical_id: e.canonical_id,
          full_name: e.full_name,
          position: e.position,
          department: name(e.department),
          unit: name(e.unit),
          is_active: e.is_active,
          events: stats.get(e.id)?.events ?? 0,
          hours: stats.get(e.id)?.hours ?? 0,
          hasRemarks: withRemarks.has(e.id),
        }));
        const headers: SortHeader[] = HEADERS.map((h) => ({
          ...h,
          dir: p.sort === h.key ? p.dir : null,
          href: `/employees${employeeListQuery(p, { sort: h.key, dir: p.sort === h.key && p.dir === "asc" ? "desc" : "asc", page: 1 })}`,
        }));
        const filtered = !!(p.q || p.dept || p.unit || p.remarks || p.status !== "active");

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <EmployeeFilters orgUnits={orgUnits} showRemarks={canSeeRemarks} values={{ q: p.q, dept: p.dept, unit: p.unit, status: p.status, remarks: p.remarks, sort: p.sort, dir: p.dir }} />
              <div className="flex flex-wrap gap-2">
                {canEdit && <NewEmployeeDialog orgUnits={orgUnits} />}
                {can(session.role, "importEmployees") && (
                  <Button asChild variant="outline" className="min-h-10" data-testid="employees-import-link">
                    <Link href="/employees/import"><Upload aria-hidden="true" /> Импорт</Link>
                  </Button>
                )}
                <ExportButton entity="employees" params={employeeExportParams(p)} />
              </div>
            </div>
            {error ? (
              <ErrorState className="bg-card" title="Не удалось загрузить сотрудников" description="Попробуйте обновить страницу." />
            ) : !rows.length ? (
              <EmptyState className="bg-card" icon={Users} title={filtered ? "Ничего не найдено" : "Справочник пуст"} description={filtered ? "Измените фильтры или сбросьте их." : "Сотрудники добавляются вручную или загружаются при импорте справочника."} />
            ) : (
              <EmployeesTable rows={rows} headers={headers} orgUnits={orgUnits} canEdit={canEdit} />
            )}
            {total > EMPLOYEE_PAGE_SIZE && (
              <nav aria-label="Страницы" className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Всего: {total}. Страница {p.page} из {pages}</span>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" className={p.page <= 1 ? "pointer-events-none opacity-50" : undefined}><Link href={`/employees${employeeListQuery(p, { page: p.page - 1 })}`}><ChevronLeft /> Назад</Link></Button>
                  <Button asChild variant="outline" size="sm" className={p.page >= pages ? "pointer-events-none opacity-50" : undefined}><Link href={`/employees${employeeListQuery(p, { page: p.page + 1 })}`}>Вперёд <ChevronRight /></Link></Button>
                </div>
              </nav>
            )}
          </div>
        );
      }}
    </SectionPage>
  );
}
