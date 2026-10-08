import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/states";
import { TrainingForm, type InitialRequest } from "@/components/trainings/training-form";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadEventTypes, loadProviders } from "@/lib/trainings/load-references";
import { loadPickUnits, loadPickableEmployees } from "@/lib/trainings/load-pickable";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Новый тренинг" };
export const dynamic = "force-dynamic";
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Новый тренинг; ?request=<id> — из заявки: данные заявки подставляются, участники выбираются из справочника. */
export default async function NewTrainingPage({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const { request: requestParam } = await searchParams;
  const session = await requireSession();
  const allowed = session.status === "ok" && can(session.role, "training");
  if (!allowed) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumbs={[{ label: "Обучения", href: "/trainings" }, { label: "Новое" }]} backHref="/trainings" backLabel="К списку обучений" title="Новый тренинг" />
        <ForbiddenState className="bg-card" title="Нет права создавать тренинги" description="Создавать тренинги могут администратор и менеджер академии." />
      </div>
    );
  }
  const supabase = await createClient();
  const [eventTypes, providers, { data: reqRows }, employees, units, initial] = await Promise.all([
    loadEventTypes(),
    loadProviders(),
    supabase
      .from("training_requests")
      .select("id, canonical_id, topic, plan_year, status")
      .is("archived_at", null)
      .in("status", ["APPROVED", "PLANNED", "NEW", "REVIEW"])
      .order("plan_year", { ascending: false })
      .order("canonical_id", { ascending: false })
      .limit(300),
    loadPickableEmployees(supabase),
    loadPickUnits(supabase),
    isUuid(requestParam)
      ? supabase.from("training_requests").select("id, canonical_id, topic, goal, participants_planned, format, kind, plan_year").eq("id", requestParam).is("archived_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const requests = (reqRows ?? []).map((r) => ({ id: r.id, label: `${r.canonical_id} · ${r.plan_year} · ${r.topic}` }));
  const ir = initial.data;
  if (ir && !requests.some((r) => r.id === ir.id)) requests.unshift({ id: ir.id, label: `${ir.canonical_id} · ${ir.plan_year} · ${ir.topic}` });
  const initialRequest: InitialRequest | null = ir ? { id: ir.id, topic: ir.topic, goal: ir.goal, participants_planned: ir.participants_planned, format: ir.format, kind: ir.kind } : null;
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Обучения", href: "/trainings" }, ...(ir ? [{ label: ir.canonical_id, href: `/trainings/requests/${ir.id}` }] : []), { label: "Новое" }]}
        backHref={ir ? `/trainings/requests/${ir.id}` : "/trainings"}
        backLabel={ir ? "К заявке" : "К списку обучений"}
        title="Новый тренинг"
        description={ir ? `Из заявки ${ir.canonical_id}: данные заявки подставлены, участников выберите из справочника.` : "Код присваивается автоматически (TR-год-номер). Остальное можно уточнить в карточке."}
      />
      <TrainingForm requests={requests} eventTypes={eventTypes} providers={providers} employees={employees} units={units} initialRequest={initialRequest} />
    </div>
  );
}
