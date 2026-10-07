import type { Metadata } from "next";
import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/states";
import { ImportWizard, type TrainingChoice } from "@/components/imports/import-wizard";
import { getSectionAccess } from "@/lib/auth/session";
import { ENTITY_DEFS, entityFromSlug, importableEntities } from "@/lib/imports/entities";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Новый импорт" };
export const dynamic = "force-dynamic";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewImportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const access = await getSectionAccess("imports");
  const crumbs = [{ label: "Импорт", href: "/imports" }, { label: "Новый импорт" }];
  if (!access.allowed) return <div className="space-y-6"><PageHeader title="Новый импорт" breadcrumbs={crumbs} /><ForbiddenState className="bg-card" /></div>;
  const entities = importableEntities(access.session.role);
  const wanted = entityFromSlug(one(raw.entity));
  const initial = wanted && entities.includes(wanted) ? wanted : entities[0];
  if (!initial) return <div className="space-y-6"><PageHeader title="Новый импорт" breadcrumbs={crumbs} /><ForbiddenState className="bg-card" /></div>;

  let trainings: TrainingChoice[] = [];
  if (entities.includes("PARTICIPANTS")) {
    const supabase = await createClient();
    const { data } = await supabase.from("trainings").select("id, canonical_id, title, start_date").is("archived_at", null).order("start_date", { ascending: false }).limit(200);
    trainings = (data ?? []).map((t) => ({ id: t.id, label: `${t.canonical_id} · ${t.title} · ${t.start_date}` }));
  }
  const tr = one(raw.training);
  return (
    <div className="space-y-6">
      <PageHeader title="Новый импорт" description={ENTITY_DEFS[initial].description} breadcrumbs={crumbs} backHref="/imports" backLabel="К центру импорта" />
      <ImportWizard entities={entities} initialEntity={initial} trainings={trainings} initialTrainingId={tr && trainings.some((t) => t.id === tr) ? tr : undefined} />
    </div>
  );
}
