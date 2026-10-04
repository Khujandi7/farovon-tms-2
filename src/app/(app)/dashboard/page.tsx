import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarRange, GraduationCap } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { YearFilter } from "@/components/dashboard/year-filter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildKpiCards, type KpiYearRow } from "@/lib/dashboard/kpi";
import { formatDateRange } from "@/lib/format";
import { SOURCE_TYPE_LABELS, TRAINING_STATUS_LABELS, TRAINING_STATUS_VARIANT } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { availableYears, parseYear } from "@/lib/years";

export const metadata: Metadata = { title: "Дашборд" };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  const { year: yearParam } = await searchParams;
  const year = parseYear(yearParam);
  const years = availableYears();

  return (
    <SectionPage section="dashboard" actions={<YearFilter years={years} selected={year} />}>
      {async () => {
        const supabase = await createClient();
        // Все показатели считает база: kpi_year() (определения A–E, docs/DECISIONS.md D4)
        const [kpiResult, recentResult] = await Promise.all([
          supabase.rpc("kpi_year", { p_year: year }),
          supabase
            .from("trainings")
            .select("id, canonical_id, title, start_date, end_date, status, source_type")
            .is("archived_at", null)
            .gte("start_date", `${year}-01-01`)
            .lte("start_date", `${year}-12-31`)
            .order("start_date", { ascending: false })
            .limit(6),
        ]);

        const kpiRow = (kpiResult.data?.[0] ?? null) as KpiYearRow | null;

        return (
          <div className="space-y-6">
            <section aria-labelledby="kpi-title" className="space-y-3">
              <h2 id="kpi-title" className="sr-only">Показатели {year} года</h2>
              {kpiResult.error || !kpiRow ? (
                <ErrorState className="bg-card" title="Не удалось получить показатели" description="База данных не вернула показатели за выбранный год. Попробуйте обновить страницу." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="kpi-grid">
                  {buildKpiCards(kpiRow).map((card) => (
                    <KpiCard key={card.id} card={card} />
                  ))}
                </div>
              )}
            </section>

            <section className="grid gap-4 lg:grid-cols-2" aria-label="Диаграммы">
              <ChartCard title="Расходы по месяцам" description={`Фактические расходы, ${year}`} />
              <ChartCard title="Обучения по месяцам" description={`Проведённые и запланированные, ${year}`} />
            </section>

            <Card>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle>Последние обучения</CardTitle>
                  <CardDescription>{year} год, по дате начала</CardDescription>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/trainings">
                    Все обучения <ArrowRight />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent>
                {recentResult.error ? (
                  <ErrorState compact title="Не удалось загрузить обучения" />
                ) : recentResult.data.length === 0 ? (
                  <EmptyState compact icon={GraduationCap} title={`За ${year} год обучений пока нет`} description="Записи появятся после ввода или импорта данных." />
                ) : (
                  <ul className="divide-y" data-testid="recent-trainings">
                    {recentResult.data.map((t) => (
                      <li key={t.id} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{t.title}</p>
                          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CalendarRange className="size-3.5" aria-hidden="true" />
                            {formatDateRange(t.start_date, t.end_date)} · {t.canonical_id} · {SOURCE_TYPE_LABELS[t.source_type]}
                          </p>
                        </div>
                        <Badge variant={TRAINING_STATUS_VARIANT[t.status]}>{TRAINING_STATUS_LABELS[t.status]}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        );
      }}
    </SectionPage>
  );
}
