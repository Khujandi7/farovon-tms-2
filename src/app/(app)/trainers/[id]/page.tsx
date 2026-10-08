import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ForbiddenState } from "@/components/common/states";
import { TRAINER_KIND_LABELS } from "@/components/trainings/trainers-panel";
import { Badge } from "@/components/ui/badge";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { formatDateRange, formatNumber } from "@/lib/format";
import { TRAINING_STATUS_LABELS, TRAINING_STATUS_VARIANT } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Тренер" };
export const dynamic = "force-dynamic";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

/** Карточка тренера: история проведённых обучений (источник — training_trainers). */
export default async function TrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "trainings")) return <ForbiddenState className="bg-card" />;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const [{ data: t }, { data: links }] = await Promise.all([
    supabase.from("trainers").select("id, canonical_id, full_name, kind, organization").eq("id", id).maybeSingle(),
    supabase.from("training_trainers").select("role, training:trainings(id, canonical_id, title, start_date, end_date, status, archived_at)").eq("trainer_id", id).limit(500),
  ]);
  if (!t) notFound();
  const trainings = (links ?? [])
    .map((l) => ({ role: l.role, tr: l.training as { id: string; canonical_id: string; title: string; start_date: string; end_date: string; status: keyof typeof TRAINING_STATUS_LABELS; archived_at: string | null } | null }))
    .filter((x): x is { role: string; tr: NonNullable<typeof x.tr> } => !!x.tr && !x.tr.archived_at)
    .sort((a, b) => b.tr.start_date.localeCompare(a.tr.start_date));
  return (
    <div className="space-y-5">
      <PageHeader title={t.full_name} breadcrumbs={[{ label: "Обучения", href: "/trainings" }, { label: "Тренеры", href: "/trainers" }, { label: t.canonical_id }]} backHref="/trainers" backLabel="К тренерам" description={`${t.canonical_id} · ${TRAINER_KIND_LABELS[t.kind]}${t.organization ? ` · ${t.organization}` : ""}`} />
      <p className="text-sm text-muted-foreground">Обучений: <strong data-testid="trainer-trainings-count">{formatNumber(trainings.length)}</strong></p>
      {trainings.length === 0 ? (
        <EmptyState className="bg-card" compact title="Тренер ещё не назначен ни на одно обучение" />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs" data-testid="trainer-trainings">
          {trainings.map(({ role, tr }) => (
            <li key={tr.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href={`/trainings/${tr.id}?tab=trainers`} className="font-medium hover:text-brand hover:underline">{tr.canonical_id} · {tr.title}</Link>
                <p className="text-xs text-muted-foreground">{formatDateRange(tr.start_date, tr.end_date)} · {role === "PRIMARY" ? "основной" : "со-тренер"}</p>
              </div>
              <Badge variant={TRAINING_STATUS_VARIANT[tr.status]}>{TRAINING_STATUS_LABELS[tr.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
