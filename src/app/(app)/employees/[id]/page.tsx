import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { AuditTimeline } from "@/components/trainings/audit-timeline";
import { AliasesPanel } from "@/components/employees/aliases-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditableField } from "@/components/workflow/editable-field";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { buildAuditLookup } from "@/lib/audit/lookup";
import type { AuditRow } from "@/lib/audit/describe";
import { formatDateRange, formatMoney, formatNumber } from "@/lib/format";
import { SOURCE_TYPE_LABELS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Сотрудник" };
export const dynamic = "force-dynamic";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "employees")) return <ForbiddenState className="bg-card" />;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();

  const canEdit = can(session.role, "employee");
  const showMoney = session.role !== "HR";
  const [{ data: units }, { data: aliases }, { data: dossier }, audit] = await Promise.all([
    supabase.from("org_units").select("id, name, parent_id, level").eq("is_active", true).order("name"),
    supabase.from("employee_aliases").select("id, alias_norm, confidence, confirmed_by").eq("employee_id", id).order("id"),
    supabase.rpc("employee_dossier", { p_employee: id }),
    supabase.rpc("entity_audit", { p_table: "employees", p_id: id, p_limit: 100 }),
  ]);
  const confirmers = [...new Set((aliases ?? []).map((a) => a.confirmed_by).filter((x): x is string => !!x))];
  const { data: people } = confirmers.length ? await supabase.from("profiles").select("id, full_name").in("id", confirmers) : { data: [] };
  const auditRows = (audit.data ?? []) as unknown as AuditRow[];
  const lookup = await buildAuditLookup(supabase, auditRows);

  const depts = (units ?? []).filter((u) => u.level === "DEPARTMENT");
  const unitOptions = (units ?? []).filter((u) => u.level === "UNIT" && (!e.department_id || u.parent_id === e.department_id));
  const deptName = depts.find((d) => d.id === e.department_id)?.name;
  const unitName = (units ?? []).find((u) => u.id === e.unit_id)?.name;
  const f = (field: string) => ({ entity: "employee" as const, id, field, canEdit });

  return (
    <div className="space-y-5">
      <PageHeader title={e.full_name} description={e.canonical_id} actions={<Badge variant={e.is_active ? "success" : "outline"}>{e.is_active ? "Активен" : "Неактивен"}</Badge>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Данные сотрудника</CardTitle>
            <CardDescription>Справочник — единственный источник сотрудников. Деактивация требует причины.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <EditableField {...f("full_name")} label="ФИО" value={e.full_name} />
              <EditableField {...f("position")} label="Должность" value={e.position} />
              <EditableField {...f("department_id")} label="Департамент" kind="select" options={[{ value: "", label: "— не выбран —" }, ...depts.map((d) => ({ value: String(d.id), label: d.name }))]} value={e.department_id === null ? "" : String(e.department_id)} display={deptName} />
              <EditableField {...f("unit_id")} label="Отдел" kind="select" options={[{ value: "", label: "— не выбран —" }, ...unitOptions.map((u) => ({ value: String(u.id), label: u.name }))]} value={e.unit_id === null ? "" : String(e.unit_id)} display={unitName} />
              <EditableField {...f("is_active")} label="Активен" kind="checkbox" value={e.is_active} display={e.is_active ? "Да" : "Нет"} reasonRequired />
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Написания ФИО</CardTitle>
            <CardDescription>Подтверждённые варианты для сопоставления.</CardDescription>
          </CardHeader>
          <CardContent>
            <AliasesPanel employeeId={id} canEdit={canEdit} aliases={(aliases ?? []).map((a) => ({ id: a.id, alias_norm: a.alias_norm, confidence: a.confidence === null ? null : Number(a.confidence), confirmed_by_name: people?.find((p) => p.id === a.confirmed_by)?.full_name ?? null }))} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Досье обучения</CardTitle>
          <CardDescription>Тренинги, в которых сотрудник присутствовал. Подразделение и должность — на момент участия.</CardDescription>
        </CardHeader>
        <CardContent>
          {!dossier?.length ? (
            <p className="text-sm text-muted-foreground">Участий пока нет.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Год</TableHead>
                  <TableHead>Тренинг</TableHead>
                  <TableHead>Даты</TableHead>
                  <TableHead className="text-right">Часы</TableHead>
                  <TableHead>Источник</TableHead>
                  <TableHead>Подразделение на момент участия</TableHead>
                  {showMoney && <TableHead className="text-right">Доля затрат</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {dossier.map((d) => (
                  <TableRow key={`${d.training_id}-${d.start_date}`}>
                    <TableCell>{d.year}</TableCell>
                    <TableCell className="max-w-72 font-medium whitespace-normal"><Link href={`/trainings/${d.training_id}`} className="hover:text-brand hover:underline">{d.title}</Link></TableCell>
                    <TableCell>{formatDateRange(d.start_date, d.end_date)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(d.hours)}</TableCell>
                    <TableCell>{SOURCE_TYPE_LABELS[d.source_type]}</TableCell>
                    <TableCell className="whitespace-normal">{[d.department_at_time, d.unit_at_time].filter(Boolean).join(" → ") || "—"}</TableCell>
                    {showMoney && <TableCell className="text-right tabular-nums">{formatMoney(d.cost_share_tjs)}</TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="emp-history" className="space-y-3">
        <h2 id="emp-history" className="text-base font-semibold">История изменений</h2>
        {audit.error ? <ErrorState className="bg-card" title="Не удалось загрузить историю" /> : <AuditTimeline rows={auditRows} lookup={lookup} role={session.role} entityPath={`/employees/${id}`} />}
      </section>
      <Link href="/employees" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> К справочнику
      </Link>
    </div>
  );
}
