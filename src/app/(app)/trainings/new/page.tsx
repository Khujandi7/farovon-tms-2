import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/states";
import { TrainingForm } from "@/components/trainings/training-form";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { loadEventTypes, loadProviders } from "@/lib/trainings/load-references";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Новый тренинг" };
export const dynamic = "force-dynamic";

export default async function NewTrainingPage() {
  const session = await requireSession();
  const allowed = session.status === "ok" && can(session.role, "training");
  let requests: { id: string; label: string }[] = [];
  const [eventTypes, providers] = allowed ? await Promise.all([loadEventTypes(), loadProviders()]) : [[], []];
  if (allowed) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("training_requests")
      .select("id, canonical_id, topic, plan_year, status")
      .is("archived_at", null)
      .in("status", ["APPROVED", "PLANNED", "NEW", "REVIEW"])
      .order("plan_year", { ascending: false })
      .order("canonical_id", { ascending: false })
      .limit(300);
    requests = (data ?? []).map((r) => ({ id: r.id, label: `${r.canonical_id} · ${r.plan_year} · ${r.topic}` }));
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Новый тренинг" description="Код присваивается автоматически (TR-год-номер). Остальное можно уточнить в карточке." />
      {allowed ? <TrainingForm requests={requests} eventTypes={eventTypes} providers={providers} /> : <ForbiddenState className="bg-card" title="Нет права создавать тренинги" description="Создавать тренинги могут администратор и менеджер академии." />}
      <Link href="/trainings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> К списку обучений
      </Link>
    </div>
  );
}
