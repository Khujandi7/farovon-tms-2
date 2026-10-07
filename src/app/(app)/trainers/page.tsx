import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/common/states";
import { TRAINER_KIND_LABELS } from "@/components/trainings/trainers-panel";
import { Badge } from "@/components/ui/badge";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Тренеры" };
export const dynamic = "force-dynamic";

/** Единый справочник тренеров: один тренер — одна запись для всех обучений, отчётов и обратной связи. */
export default async function TrainersPage() {
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "trainings")) return <ForbiddenState className="bg-card" />;
  const supabase = await createClient();
  const [{ data: trainers, error }, { data: links }] = await Promise.all([
    supabase.from("trainers").select("id, canonical_id, full_name, kind, organization").order("full_name").limit(1000),
    supabase.from("training_trainers").select("trainer_id").limit(20000),
  ]);
  const counts = new Map<string, number>();
  for (const l of links ?? []) counts.set(l.trainer_id, (counts.get(l.trainer_id) ?? 0) + 1);
  return (
    <div className="space-y-5">
      <PageHeader title="Тренеры" breadcrumbs={[{ label: "Обучения", href: "/trainings" }, { label: "Тренеры" }]} backHref="/trainings" backLabel="К списку обучений" description="Справочник тренеров. Новый тренер добавляется на вкладке «Тренеры» карточки обучения." />
      {error ? (
        <ErrorState className="bg-card" title="Не удалось загрузить тренеров" description="Попробуйте обновить страницу." />
      ) : !trainers?.length ? (
        <EmptyState className="bg-card" title="Тренеров пока нет" description="Добавьте тренера на вкладке «Тренеры» карточки обучения." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs" data-testid="trainer-list">
          {trainers.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm" data-testid="trainer-list-row">
              <div className="min-w-0">
                <Link href={`/trainers/${t.id}`} className="font-medium hover:text-brand hover:underline">{t.full_name}</Link>
                <p className="text-xs text-muted-foreground">{t.canonical_id}{t.organization ? ` · ${t.organization}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{TRAINER_KIND_LABELS[t.kind]}</Badge>
                <span className="text-xs text-muted-foreground">обучений: {counts.get(t.id) ?? 0}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
