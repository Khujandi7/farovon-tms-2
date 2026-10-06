import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { ArchiveButton } from "@/components/trainings/archive-button";
import { AuditTimeline } from "@/components/trainings/audit-timeline";
import { LinkTrainingPanel } from "@/components/trainings/link-training-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EditableField } from "@/components/workflow/editable-field";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { buildAuditLookup } from "@/lib/audit/lookup";
import type { AuditRow } from "@/lib/audit/describe";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_OPTIONS, REQUEST_STATUS_VARIANT, TRAINING_FORMAT_LABELS, TRAINING_FORMAT_OPTIONS, TRAINING_KIND_LABELS, TRAINING_KIND_OPTIONS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Заявка на обучение" };
export const dynamic = "force-dynamic";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "trainings")) return <ForbiddenState className="bg-card" />;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: r } = await supabase.from("training_requests").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();

  const archived = r.archived_at !== null;
  const canEdit = can(session.role, "request") && !archived;
  const [{ data: linked }, { data: free }, audit] = await Promise.all([
    supabase.from("v_training_list").select("id, canonical_id, title, start_date, end_date, status, participants").eq("request_id", id).is("archived_at", null),
    canEdit ? supabase.from("trainings").select("id, canonical_id, title, start_date").is("request_id", null).is("archived_at", null).order("start_date", { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
    supabase.rpc("entity_audit", { p_table: "training_requests", p_id: id, p_limit: 200 }),
  ]);
  const rows = (audit.data ?? []) as unknown as AuditRow[];
  const lookup = await buildAuditLookup(supabase, rows);
  const f = (field: string) => ({ entity: "request" as const, id, field, canEdit });
  const currency = r.budget_currency ?? "TJS";

  return (
    <div className="space-y-5">
      <PageHeader
        title={r.topic}
        description={`${r.canonical_id} · план ${r.plan_year}`}
        actions={
          <>
            <Badge variant={REQUEST_STATUS_VARIANT[r.status]}>{REQUEST_STATUS_LABELS[r.status]}</Badge>
            {archived && <Badge variant="outline">В архиве</Badge>}
            {can(session.role, "request") && <ArchiveButton entity="request" id={id} archived={archived} subject={r.canonical_id} />}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Заявка</CardTitle>
            <CardDescription>Статус, бюджет и перенос меняются с причиной. Валюта исторических заявок сохраняется (USD остаётся USD).</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <EditableField {...f("topic")} label="Тема" value={r.topic} />
              <EditableField {...f("status")} label="Статус" kind="select" options={REQUEST_STATUS_OPTIONS} value={r.status} display={REQUEST_STATUS_LABELS[r.status]} reasonRequired />
              <EditableField {...f("plan_year")} label="Год плана" kind="number" inputMode="numeric" value={r.plan_year} />
              <EditableField {...f("request_date")} label="Дата заявки" kind="date" value={r.request_date} display={r.request_date ? formatDate(r.request_date) : undefined} />
              <EditableField {...f("participants_planned")} label="Участников по плану" kind="number" inputMode="numeric" value={r.participants_planned} display={r.participants_planned === null ? undefined : formatNumber(r.participants_planned)} />
              <EditableField
                {...f("budget_amount")}
                label={`Бюджет, ${currency}`}
                kind="number"
                value={r.budget_amount}
                display={r.budget_amount === null ? undefined : formatMoney(Number(r.budget_amount), currency)}
                reasonRequired
                hint={r.budget_currency && r.budget_currency !== "TJS" ? `Историческая заявка в ${r.budget_currency}: меняется только сумма` : undefined}
              />
              <EditableField {...f("format")} label="Формат" kind="select" options={[{ value: "", label: "— не указан —" }, ...TRAINING_FORMAT_OPTIONS]} value={r.format ?? ""} display={r.format ? TRAINING_FORMAT_LABELS[r.format] : undefined} />
              <EditableField {...f("kind")} label="Тип" kind="select" options={TRAINING_KIND_OPTIONS} value={r.kind ?? "UNSPECIFIED"} display={TRAINING_KIND_LABELS[r.kind ?? "UNSPECIFIED"]} />
              <EditableField {...f("requester_raw")} label="Инициатор" value={r.requester_raw} />
              <EditableField {...f("trainer_raw")} label="Тренер" value={r.trainer_raw} />
              <EditableField {...f("direction")} label="Направление" value={r.direction} />
              <EditableField {...f("period_raw")} label="Период" value={r.period_raw} />
              <EditableField {...f("carry_forward")} label="Перенос на другой год" kind="checkbox" value={r.carry_forward} display={r.carry_forward ? "Да" : "Нет"} reasonRequired />
              <div className="sm:col-span-2"><EditableField {...f("goal")} label="Цель" kind="textarea" value={r.goal} /></div>
              <div className="sm:col-span-2"><EditableField {...f("comment")} label="Комментарий" kind="textarea" value={r.comment} /></div>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>План и факт</CardTitle>
            <CardDescription>Привязанные тренинги и число участников.</CardDescription>
          </CardHeader>
          <CardContent>
            <LinkTrainingPanel
              requestId={id}
              plannedParticipants={r.participants_planned}
              trainings={(linked ?? []).map((t) => ({ id: t.id ?? "", canonical_id: t.canonical_id ?? "", title: t.title ?? "", start_date: t.start_date ?? "", end_date: t.end_date ?? "", status: t.status ?? "PLANNED", participants: Number(t.participants ?? 0) }))}
              choices={(free ?? []).map((t) => ({ id: t.id, label: `${t.canonical_id} · ${formatDate(t.start_date)} · ${t.title}` }))}
              canEdit={canEdit}
            />
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="req-history" className="space-y-3">
        <h2 id="req-history" className="text-base font-semibold">История изменений</h2>
        {audit.error ? <ErrorState className="bg-card" title="Не удалось загрузить историю" /> : <AuditTimeline rows={rows} lookup={lookup} role={session.role} entityPath={`/trainings/requests/${id}`} />}
      </section>
      <Link href="/trainings/requests" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> К заявкам
      </Link>
    </div>
  );
}
