import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarCheck, Clock, Coins, History, Users } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArchiveButton } from "@/components/trainings/archive-button";
import { AttendanceMatrix, type AttendanceCell } from "@/components/trainings/attendance-matrix";
import { AuditTimeline } from "@/components/trainings/audit-timeline";
import { ExpensesPanel, type ExpenseRow } from "@/components/trainings/expenses-panel";
import { ParticipantsPanel, type ParticipantRow } from "@/components/trainings/participants-panel";
import { RequestLinkPanel } from "@/components/trainings/request-link-panel";
import { SessionsPanel, type SessionRow } from "@/components/trainings/sessions-panel";
import { EditableField } from "@/components/workflow/editable-field";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { buildAuditLookup } from "@/lib/audit/lookup";
import type { AuditRow } from "@/lib/audit/describe";
import { formatDate, formatDateRange, formatMoney, formatNumber } from "@/lib/format";
import {
  SOURCE_TYPE_LABELS,
  TRAINING_FORMAT_LABELS,
  TRAINING_FORMAT_OPTIONS,
  TRAINING_KIND_LABELS,
  TRAINING_KIND_OPTIONS,
  TRAINING_STATUS_LABELS,
  TRAINING_STATUS_OPTIONS,
  TRAINING_STATUS_VARIANT,
  UNPLANNED_REASON_LABELS,
  UNPLANNED_REASON_OPTIONS,
} from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Карточка тренинга" };
export const dynamic = "force-dynamic";

const TABS = [
  { id: "overview", label: "Обзор" },
  { id: "sessions", label: "Заходы" },
  { id: "participants", label: "Участники" },
  { id: "attendance", label: "Посещаемость" },
  { id: "expenses", label: "Расходы" },
  { id: "audit", label: "История" },
] as const;
type TabId = (typeof TABS)[number]["id"];
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export default async function TrainingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "overview";
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "trainings")) {
    return <ForbiddenState className="bg-card" />;
  }
  if (!isUuid(id)) notFound();
  const role = session.role;
  const supabase = await createClient();

  const [{ data: t }, { data: v }] = await Promise.all([
    supabase.from("trainings").select("*").eq("id", id).maybeSingle(),
    supabase.from("v_training_list").select("participants, man_hours, actual_tjs, attendance_mode").eq("id", id).maybeSingle(),
  ]);
  if (!t || !v) notFound();

  const archived = t.archived_at !== null;
  const canEdit = can(role, "training") && !archived;
  const showMoney = role !== "HR";

  const { data: perParticipant } = showMoney ? await supabase.rpc("cost_per_participant", { p_training: id }) : { data: null };

  const [users, linked] = await Promise.all([
    supabase.from("profiles").select("id, full_name").in("id", [t.created_by, t.updated_by].filter((x): x is string => !!x)),
    t.request_id ? supabase.from("training_requests").select("id, canonical_id, topic, plan_year").eq("id", t.request_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const userName = (uid: string | null) => users.data?.find((u) => u.id === uid)?.full_name ?? null;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={`${t.canonical_id} · ${formatDateRange(t.start_date, t.end_date)}`}
        actions={
          <>
            <Badge variant={TRAINING_STATUS_VARIANT[t.status]}>{TRAINING_STATUS_LABELS[t.status]}</Badge>
            {archived && <Badge variant="outline">В архиве</Badge>}
            {can(role, "training") && <ArchiveButton entity="training" id={t.id} archived={archived} subject={t.canonical_id} />}
          </>
        }
      />

      <section aria-label="Показатели" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Участников" value={formatNumber(v.participants)} sub={t.participants_planned !== null ? `по плану ${t.participants_planned}` : undefined} testId="kpi-participants" />
        <Kpi icon={Clock} label="Человеко-часов" value={formatNumber(v.man_hours)} sub={v.attendance_mode ? "по посещаемости" : "по прежнему правилу"} testId="kpi-manhours" />
        <Kpi icon={CalendarCheck} label="Часов программы" value={formatNumber(t.hours)} testId="kpi-hours" />
        <Kpi icon={Coins} label="Факт расходов" value={showMoney ? formatMoney(v.actual_tjs) : "Ограничено"} sub={showMoney && perParticipant !== null && perParticipant !== undefined ? `на участника ${formatMoney(Number(perParticipant))}` : undefined} testId="kpi-actual" />
      </section>

      <nav aria-label="Разделы тренинга" className="-mx-1 flex gap-1 overflow-x-auto border-b px-1">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={x.id === "overview" ? `/trainings/${id}` : `/trainings/${id}?tab=${x.id}`}
            aria-current={tab === x.id ? "page" : undefined}
            className={cn("shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap", tab === x.id ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <Overview t={t} canEdit={canEdit} role={role} linked={linked.data} createdBy={userName(t.created_by)} updatedBy={userName(t.updated_by)} />
      )}
      {tab === "sessions" && <SessionsTab id={id} canEdit={can(role, "training")} archived={archived} attendanceMode={v.attendance_mode ?? false} />}
      {tab === "participants" && <ParticipantsTab id={id} canEdit={can(role, "participants")} archived={archived} canAddEmployees={can(role, "employee")} />}
      {tab === "attendance" && <AttendanceTab id={id} canEdit={can(role, "attendance")} archived={archived} attendanceMode={v.attendance_mode ?? false} />}
      {tab === "expenses" && <ExpensesTab id={id} role={role} archived={archived} total={v.actual_tjs} perParticipant={perParticipant === null || perParticipant === undefined ? null : Number(perParticipant)} />}
      {tab === "audit" && <AuditTab id={id} role={role} />}
      <Link href="/trainings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> К списку обучений
      </Link>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, sub, testId }: { icon: typeof Users; label: string; value: string; sub?: string; testId: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="space-y-1 px-4">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" /> {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums" data-testid={testId}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}

async function Overview({ t, canEdit, role, linked, createdBy, updatedBy }: { t: import("@/types/database").Database["public"]["Tables"]["trainings"]["Row"]; canEdit: boolean; role: import("@/lib/auth/roles").AppRole; linked: { id: string; canonical_id: string; topic: string; plan_year: number } | null; createdBy: string | null; updatedBy: string | null }) {
  const supabase = await createClient();
  const [{ data: requests }, { data: sessionsCount }, lineage] = await Promise.all([
    canEdit
      ? supabase.from("training_requests").select("id, canonical_id, topic, plan_year").is("archived_at", null).order("plan_year", { ascending: false }).order("canonical_id", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] as { id: string; canonical_id: string; topic: string; plan_year: number }[] }),
    supabase.from("training_sessions").select("id").eq("training_id", t.id),
    can(role, "dq")
      ? supabase.from("source_records").select("sheet, row_number, status, last_seen_at").eq("entity_table", "trainings").eq("entity_id", t.id).limit(5)
      : Promise.resolve({ data: [] as { sheet: string; row_number: number; status: string; last_seen_at: string }[] }),
  ]);
  const hasSessions = (sessionsCount?.length ?? 0) > 0;
  const f = (field: string) => ({ entity: "training" as const, id: t.id, field, canEdit });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Основное</CardTitle>
          <CardDescription>Наведите на поле и нажмите ✎, чтобы изменить. Статус, часы и даты — с причиной.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <EditableField {...f("title")} label="Название" value={t.title} />
            <EditableField {...f("status")} label="Статус" kind="select" options={TRAINING_STATUS_OPTIONS} value={t.status} display={TRAINING_STATUS_LABELS[t.status]} reasonRequired />
            <EditableField {...f("format")} label="Формат" kind="select" options={TRAINING_FORMAT_OPTIONS} value={t.format} display={TRAINING_FORMAT_LABELS[t.format]} />
            <EditableField {...f("kind")} label="Тип" kind="select" options={TRAINING_KIND_OPTIONS} value={t.kind} display={TRAINING_KIND_LABELS[t.kind]} />
            <EditableField {...f("start_date")} label="Начало" kind="date" value={t.start_date} display={formatDate(t.start_date)} reasonRequired canEdit={canEdit && !hasSessions} hint={hasSessions ? "Считается по заходам" : undefined} />
            <EditableField {...f("end_date")} label="Окончание" kind="date" value={t.end_date} display={formatDate(t.end_date)} reasonRequired canEdit={canEdit && !hasSessions} />
            <EditableField {...f("hours")} label="Часы программы" kind="number" value={t.hours} display={formatNumber(t.hours)} reasonRequired canEdit={canEdit && !hasSessions} hint={hasSessions ? "Считается по заходам" : undefined} />
            <EditableField {...f("location")} label="Место" value={t.location} />
            <EditableField {...f("participants_planned")} label="Участников по плану" kind="number" inputMode="numeric" value={t.participants_planned} />
            {t.source_type === "UNPLANNED" && (
              <EditableField {...f("unplanned_reason")} label="Причина внепланового" kind="select" options={UNPLANNED_REASON_OPTIONS} value={t.unplanned_reason ?? ""} display={t.unplanned_reason ? UNPLANNED_REASON_LABELS[t.unplanned_reason] : undefined} />
            )}
            <div className="sm:col-span-2">
              <EditableField {...f("description")} label="Описание" kind="textarea" value={t.description} />
            </div>
            <div className="sm:col-span-2">
              <EditableField {...f("comment")} label="Комментарий" kind="textarea" value={t.comment} />
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Источник и заявка</CardTitle>
            <CardDescription>
              {SOURCE_TYPE_LABELS[t.source_type]}
              {t.source_type === "UNPLANNED" && !t.source_confirmed ? " · не подтверждено" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestLinkPanel
              trainingId={t.id}
              sourceType={t.source_type}
              linked={linked ? { id: linked.id, code: linked.canonical_id, topic: linked.topic, year: linked.plan_year } : null}
              options={(requests ?? []).map((r) => ({ id: r.id, label: `${r.canonical_id} · ${r.plan_year} · ${r.topic}` }))}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><History className="size-4" aria-hidden="true" /> Откуда данные</CardTitle>
            <CardDescription>Происхождение и последние изменения записи.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-2 text-sm" data-testid="provenance">
              <Row k="Создано" v={`${formatDate(t.created_at.slice(0, 10))}${createdBy ? ` · ${createdBy}` : ""}`} />
              <Row k="Изменено" v={`${formatDate(t.updated_at.slice(0, 10))}${updatedBy ? ` · ${updatedBy}` : ""}`} />
              <Row k="Происхождение" v={t.legacy_reestr_id ? `Импорт: реестр № ${t.legacy_reestr_id}` : "Введено в TMS"} />
              {(lineage.data ?? []).map((r) => (
                <Row key={`${r.sheet}-${r.row_number}`} k="Источник" v={`${r.sheet}, строка ${r.row_number} (${r.status})`} />
              ))}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">Полная история с автором, причиной и откатом — на вкладке «История».</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="break-words">{v}</dd>
    </div>
  );
}

async function loadParticipants(id: string): Promise<ParticipantRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("training_participants")
    .select("id, employee_id, attended, session_id, department_snapshot, unit_snapshot, position_snapshot, employee:employees(full_name, canonical_id)")
    .eq("training_id", id)
    .limit(5000);
  return (data ?? [])
    .map((p) => {
      const e = p.employee as { full_name: string; canonical_id: string } | null;
      return { id: p.id, employee_id: p.employee_id, full_name: e?.full_name ?? "—", canonical_id: e?.canonical_id ?? "", unit: p.unit_snapshot ?? p.department_snapshot, position: p.position_snapshot, attended: p.attended, session_id: p.session_id };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "ru"));
}

async function loadSessions(id: string): Promise<SessionRow[]> {
  const supabase = await createClient();
  const [{ data }, { data: att }] = await Promise.all([
    supabase.from("training_sessions").select("id, session_no, start_date, end_date, hours, location, comment").eq("training_id", id).order("session_no"),
    supabase.from("session_attendance").select("session_id, status, participant:training_participants!inner(training_id)").eq("participant.training_id", id).eq("status", "PRESENT").limit(50000),
  ]);
  const present = new Map<string, number>();
  for (const a of att ?? []) present.set(a.session_id, (present.get(a.session_id) ?? 0) + 1);
  return (data ?? []).map((s) => ({ ...s, present: present.get(s.id) ?? 0 }));
}

async function SessionsTab({ id, canEdit, archived, attendanceMode }: { id: string; canEdit: boolean; archived: boolean; attendanceMode: boolean }) {
  const sessions = await loadSessions(id);
  void attendanceMode;
  return <SessionsPanel trainingId={id} sessions={sessions} canEdit={canEdit} archived={archived} />;
}

async function ParticipantsTab({ id, canEdit, archived, canAddEmployees }: { id: string; canEdit: boolean; archived: boolean; canAddEmployees: boolean }) {
  const supabase = await createClient();
  const [participants, { data: units }] = await Promise.all([
    loadParticipants(id),
    supabase.from("org_units").select("id, name, level, parent_id").eq("is_active", true).order("name"),
  ]);
  const byId = new Map((units ?? []).map((u) => [u.id, u]));
  const orgUnits = (units ?? [])
    .map((u) => ({ id: u.id, label: u.level === "UNIT" && u.parent_id ? `${byId.get(u.parent_id)?.name ?? ""} → ${u.name}` : u.name }))
    .sort((a, b) => a.label.localeCompare(b.label, "ru"));
  return <ParticipantsPanel trainingId={id} participants={participants} orgUnits={orgUnits} canEdit={canEdit} archived={archived} canAddEmployees={canAddEmployees} />;
}

async function AttendanceTab({ id, canEdit, archived, attendanceMode }: { id: string; canEdit: boolean; archived: boolean; attendanceMode: boolean }) {
  const supabase = await createClient();
  const [participants, sessions, { data: att }] = await Promise.all([
    loadParticipants(id),
    loadSessions(id),
    supabase.from("session_attendance").select("participant_id, session_id, status, participant:training_participants!inner(training_id)").eq("participant.training_id", id).limit(50000),
  ]);
  const cells: AttendanceCell[] = (att ?? []).map((a) => ({ participant_id: a.participant_id, session_id: a.session_id, status: a.status }));
  return <AttendanceMatrix trainingId={id} sessions={sessions} participants={participants} cells={cells} attendanceMode={attendanceMode} canEdit={canEdit} archived={archived} />;
}

async function ExpensesTab({ id, role, archived, total, perParticipant }: { id: string; role: import("@/lib/auth/roles").AppRole; archived: boolean; total: number | null; perParticipant: number | null }) {
  const supabase = await createClient();
  const financialAccess = can(role, "financialRead");
  const [{ data: rows }, { data: cats }] = financialAccess
    ? await Promise.all([
        supabase.from("expense_operations").select("id, category_id, amount, currency, operation_date, fx_rate, amount_tjs, comment, voided_at, void_reason, category:expense_categories(name)").eq("training_id", id).order("operation_date", { ascending: false }).order("created_at", { ascending: false }),
        supabase.from("expense_categories").select("id, name").order("name"),
      ])
    : [{ data: [] }, { data: [] }];
  const expenses: ExpenseRow[] = (rows ?? []).map((e) => ({
    id: e.id,
    category_id: e.category_id,
    category: (e.category as { name: string } | null)?.name ?? "Расход",
    amount: Number(e.amount),
    currency: e.currency,
    operation_date: e.operation_date,
    fx_rate: e.fx_rate === null ? null : Number(e.fx_rate),
    amount_tjs: e.amount_tjs === null ? null : Number(e.amount_tjs),
    comment: e.comment,
    voided_at: e.voided_at,
    void_reason: e.void_reason,
  }));
  return (
    <ExpensesPanel
      trainingId={id}
      expenses={expenses}
      categories={(cats ?? []).map((c) => ({ id: c.id, name: c.name }))}
      financialAccess={financialAccess}
      canEdit={can(role, "expense")}
      canVoid={can(role, "expenseVoid")}
      archived={archived}
      totalTjs={total}
      perParticipant={perParticipant}
    />
  );
}

async function AuditTab({ id, role }: { id: string; role: import("@/lib/auth/roles").AppRole }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("entity_audit", { p_table: "trainings", p_id: id, p_limit: 200 });
  if (error) return <ErrorState className="bg-card" title="Не удалось загрузить историю" description="Попробуйте обновить страницу." />;
  const rows = (data ?? []) as unknown as AuditRow[];
  const lookup = await buildAuditLookup(supabase, rows);
  return <AuditTimeline rows={rows} lookup={lookup} role={role} entityPath={`/trainings/${id}`} />;
}
