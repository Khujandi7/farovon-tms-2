import type { Metadata } from "next";
import Link from "next/link";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { LifecycleKpis } from "@/components/dashboard/lifecycle-kpis";
import { YearFilter } from "@/components/dashboard/year-filter";
import { TRAINER_KIND_LABELS } from "@/components/trainings/trainers-panel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { availableYears, parseYear } from "@/lib/years";

export const metadata: Metadata = { title: "Отчёты" };
export const dynamic = "force-dynamic";

/** Отчёты на тех же определениях, что и дашборд: lifecycle_kpis, department_participation, trainer_performance (M21). Суммы считает БД. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  const year = parseYear((await searchParams).year);
  return (
    <SectionPage section="reports" actions={<YearFilter years={availableYears()} selected={year} basePath="/reports" />}>
      {async () => {
        const supabase = await createClient();
        const [dep, trn] = await Promise.all([supabase.rpc("department_participation", { p_year: year }), supabase.rpc("trainer_performance", { p_year: year })]);
        return (
          <div className="space-y-6" data-testid="reports">
            <LifecycleKpis year={year} />
            <Card>
              <CardHeader>
                <CardTitle>Участие подразделений</CardTitle>
                <CardDescription>Подразделение — на момент обучения (снимок участника): переводы сотрудников прошлую аналитику не меняют.</CardDescription>
              </CardHeader>
              <CardContent>
                {dep.error ? (
                  <ErrorState compact title="Не удалось загрузить отчёт" />
                ) : !dep.data?.length ? (
                  <EmptyState compact title={`За ${year} год проведённых обучений с участниками нет`} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="department-report">
                      <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Подразделение</th><th className="px-3 font-medium">Обучений</th><th className="px-3 font-medium">Участий</th><th className="px-3 font-medium">Сотрудников</th><th className="pl-3 font-medium">Человеко-часов</th></tr></thead>
                      <tbody>
                        {dep.data.map((r) => (
                          <tr key={r.department} className="border-b last:border-0" data-testid="department-row">
                            <td className="py-2 pr-3 font-medium">{r.department}</td><td className="px-3 tabular-nums">{formatNumber(r.events)}</td><td className="px-3 tabular-nums">{formatNumber(r.participants)}</td><td className="px-3 tabular-nums">{formatNumber(r.unique_employees)}</td><td className="pl-3 tabular-nums">{formatNumber(Number(r.man_hours))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Эффективность тренеров</CardTitle>
                <CardDescription>Оценка тренера — блок «Тренер» обратной связи. Ниже порога анонимности оценка скрыта для ролей без права видеть личность респондента.</CardDescription>
              </CardHeader>
              <CardContent>
                {trn.error ? (
                  <ErrorState compact title="Не удалось загрузить отчёт" />
                ) : !trn.data?.length ? (
                  <EmptyState compact title={`За ${year} год обучений с назначенными тренерами нет`} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" data-testid="trainer-report">
                      <thead><tr className="border-b text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Тренер</th><th className="px-3 font-medium">Тип</th><th className="px-3 font-medium">Обучений</th><th className="px-3 font-medium">Участников</th><th className="px-3 font-medium">Человеко-часов</th><th className="pl-3 font-medium">Оценка</th></tr></thead>
                      <tbody>
                        {trn.data.map((r) => (
                          <tr key={r.trainer_id} className="border-b last:border-0" data-testid="trainer-report-row">
                            <td className="py-2 pr-3 font-medium"><Link href={`/trainers/${r.trainer_id}`} className="hover:text-brand hover:underline">{r.trainer}</Link>{r.organization && <span className="block text-xs font-normal text-muted-foreground">{r.organization}</span>}</td>
                            <td className="px-3"><Badge variant="outline">{TRAINER_KIND_LABELS[r.kind]}</Badge></td>
                            <td className="px-3 tabular-nums">{formatNumber(r.events)}</td><td className="px-3 tabular-nums">{formatNumber(r.participants)}</td><td className="px-3 tabular-nums">{formatNumber(Number(r.man_hours))}</td>
                            <td className="pl-3 tabular-nums">{r.scores_hidden ? "скрыта" : r.avg_trainer_score === null ? "—" : formatNumber(Number(r.avg_trainer_score))}<span className="block text-xs text-muted-foreground">ответов: {r.responses}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        );
      }}
    </SectionPage>
  );
}
