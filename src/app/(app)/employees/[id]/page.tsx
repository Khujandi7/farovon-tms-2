import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { AliasesPanel } from "@/components/employees/aliases-panel";
import { AgreementsTab } from "@/components/dossier/agreements-tab";
import { CertificatesTab } from "@/components/dossier/certificates-tab";
import { CostsTab } from "@/components/dossier/costs-tab";
import { DocumentsPanel } from "@/components/dossier/documents-panel";
import { DossierTabs } from "@/components/dossier/dossier-tabs";
import { EventsTab } from "@/components/dossier/events-tab";
import { ExamsTab } from "@/components/dossier/exams-tab";
import { GoalsTab } from "@/components/dossier/goals-tab";
import { IndividualEducationTab } from "@/components/dossier/individual-tab";
import { LearningHistoryTab } from "@/components/dossier/learning-history-tab";
import { SkillsTab } from "@/components/dossier/skills-tab";
import { TimelineTab } from "@/components/dossier/timeline-tab";
import { AuditTimeline } from "@/components/trainings/audit-timeline";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditableField } from "@/components/workflow/editable-field";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { buildAuditLookup } from "@/lib/audit/lookup";
import type { AuditRow } from "@/lib/audit/describe";
import { parseTab, visibleTabs } from "@/lib/employees/tabs";
import { formatMoney, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Сотрудник" };
export const dynamic = "force-dynamic";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function Kpi({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-xs">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums" data-testid={testId}>{value}</dd>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default async function EmployeePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string | string[] }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "employees")) return <ForbiddenState className="bg-card" />;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  if (!e) notFound();

  const role = session.role;
  const tab = parseTab(sp.tab, role);
  const tabs = visibleTabs(role);
  const canEdit = can(role, "employee");
  const f = (field: string) => ({ entity: "employee" as const, id, field, canEdit });

  let body: React.ReactNode;
  switch (tab) {
    case "history": body = <LearningHistoryTab employeeId={id} role={role} />; break;
    case "events": body = <EventsTab employeeId={id} role={role} />; break;
    case "exams": body = <ExamsTab employeeId={id} role={role} />; break;
    case "certificates": body = <CertificatesTab employeeId={id} role={role} />; break;
    case "individual": body = <IndividualEducationTab employeeId={id} role={role} />; break;
    case "contracts": body = <AgreementsTab employeeId={id} role={role} />; break;
    case "documents": body = <DocumentsPanel role={role} scope={{ employeeId: id }} title="Документы сотрудника" />; break;
    case "skills": body = <SkillsTab employeeId={id} role={role} />; break;
    case "plan": body = <GoalsTab employeeId={id} role={role} />; break;
    case "costs": body = <CostsTab employeeId={id} role={role} />; break;
    case "timeline": body = <TimelineTab employeeId={id} />; break;
    case "audit": {
      const audit = await supabase.rpc("entity_audit", { p_table: "employees", p_id: id, p_limit: 200 });
      const rows = (audit.data ?? []) as unknown as AuditRow[];
      const lookup = await buildAuditLookup(supabase, rows);
      body = audit.error ? (
        <ErrorState className="bg-card" title="Не удалось загрузить историю" />
      ) : (
        <section aria-labelledby="emp-history" className="space-y-3">
          <h2 id="emp-history" className="text-base font-semibold">История изменений</h2>
          <AuditTimeline rows={rows} lookup={lookup} role={role} entityPath={`/employees/${id}`} />
        </section>
      );
      break;
    }
    default: {
      const [{ data: units }, { data: aliases }, { data: summaryRows }, { data: contact }] = await Promise.all([
        supabase.from("org_units").select("id, name, parent_id, level").eq("is_active", true).order("name"),
        supabase.from("employee_aliases").select("id, alias_norm, confidence, confirmed_by").eq("employee_id", id).order("id"),
        supabase.rpc("employee_learning_summary", { p_employee: id }),
        supabase.from("employee_contacts").select("phone, email").eq("employee_id", id).maybeSingle(),
      ]);
      const confirmers = [...new Set((aliases ?? []).map((a) => a.confirmed_by).filter((x): x is string => !!x))];
      const { data: people } = confirmers.length ? await supabase.from("profiles").select("id, full_name").in("id", confirmers) : { data: [] };
      const depts = (units ?? []).filter((u) => u.level === "DEPARTMENT");
      const unitOptions = (units ?? []).filter((u) => u.level === "UNIT" && (!e.department_id || u.parent_id === e.department_id));
      const deptName = depts.find((d) => d.id === e.department_id)?.name;
      const unitName = (units ?? []).find((u) => u.id === e.unit_id)?.name;
      const s = summaryRows?.[0];
      const money = s && s.company_spent_tjs !== null;
      body = (
        <div className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="employee-kpi">
            <Kpi label="Мероприятий" value={formatNumber(s?.events_count ?? 0)} hint={`плановых ${s?.planned_count ?? 0} · внеплановых ${s?.unplanned_count ?? 0}`} testId="kpi-events" />
            <Kpi label="Человеко-часов" value={formatNumber(s?.man_hours ?? 0)} testId="kpi-hours" />
            <Kpi label="Экзамены" value={`${s?.exams_passed ?? 0} / ${s?.exams_total ?? 0}`} hint={`сдано / всего · не сдано ${s?.exams_failed ?? 0}`} testId="kpi-exams" />
            <Kpi label="Сертификаты" value={`${s?.certificates_active ?? 0} / ${s?.certificates_total ?? 0}`} hint="действующих / всего" testId="kpi-certs" />
            {money && <Kpi label="Затраты компании" value={formatMoney(s?.company_spent_tjs ?? 0)} testId="kpi-company" />}
            {money && <Kpi label="Индивидуальное обучение" value={formatMoney(s?.individual_education_tjs ?? 0)} />}
            {money && <Kpi label="Обязательства сотрудника" value={formatMoney(s?.employee_obligation_tjs ?? 0)} />}
            {money && <Kpi label="Непогашено" value={formatMoney(s?.outstanding_obligation_tjs ?? 0)} testId="kpi-outstanding" />}
          </dl>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Данные сотрудника</CardTitle>
                <CardDescription>Справочник — единственный источник сотрудников. Деактивация, увольнение и смена табельного номера требуют причины.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <EditableField {...f("full_name")} label="ФИО" value={e.full_name} />
                  <EditableField {...f("employee_code")} label="Табельный номер" value={e.employee_code} reasonRequired />
                  <EditableField {...f("position")} label="Должность" value={e.position} />
                  <EditableField {...f("department_id")} label="Департамент" kind="select" options={[{ value: "", label: "— не выбран —" }, ...depts.map((d) => ({ value: String(d.id), label: d.name }))]} value={e.department_id === null ? "" : String(e.department_id)} display={deptName} />
                  <EditableField {...f("unit_id")} label="Отдел" kind="select" options={[{ value: "", label: "— не выбран —" }, ...unitOptions.map((u) => ({ value: String(u.id), label: u.name }))]} value={e.unit_id === null ? "" : String(e.unit_id)} display={unitName} />
                  <EditableField {...f("hire_date")} label="Дата приёма" kind="date" value={e.hire_date} />
                  <EditableField {...f("termination_date")} label="Дата увольнения" kind="date" value={e.termination_date} reasonRequired />
                  <EditableField {...f("phone")} label="Телефон" value={contact?.phone ?? null} />
                  <EditableField {...f("email")} label="E-mail" value={contact?.email ?? null} />
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
        </div>
      );
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={e.full_name}
        description={[e.canonical_id, e.employee_code].filter(Boolean).join(" · ")}
        breadcrumbs={[{ label: "Сотрудники", href: "/employees" }, { label: e.full_name }]}
        backHref="/employees"
        backLabel="К справочнику"
        actions={<Badge variant={e.is_active ? "success" : "outline"}>{e.is_active ? "Активен" : "Неактивен"}</Badge>}
      />
      <DossierTabs employeeId={id} active={tab} tabs={tabs} />
      <div data-testid={`dossier-${tab}`}>{body}</div>
    </div>
  );
}
