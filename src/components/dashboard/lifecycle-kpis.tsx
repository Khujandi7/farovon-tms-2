import Link from "next/link";
import { ErrorState } from "@/components/common/states";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

type Tile = { id: string; label: string; value: string; hint?: string; href?: string };

/**
 * Показатели сквозного жизненного цикла. Единый источник — lifecycle_kpis(год) в БД (те же определения, что у kpi_year);
 * дашборд и «Отчёты» показывают одни и те же числа. Здесь только форматирование: NULL не превращается в 0.
 */
export async function LifecycleKpis({ year }: { year: number }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lifecycle_kpis", { p_year: year });
  const k = data?.[0];
  if (error || !k) return <ErrorState className="bg-card" compact title="Не удалось получить показатели жизненного цикла" description="Попробуйте обновить страницу." />;
  const money = (v: number | null) => (v === null ? "Нет доступа" : formatMoney(Number(v)));
  const tiles: Tile[] = [
    { id: "delivered", label: "Проведено обучений", value: formatNumber(k.delivered_events), hint: `план ${k.planned_events} · вне плана ${k.unplanned_events}`, href: "/trainings" },
    { id: "participants", label: "Участников", value: formatNumber(k.participants), hint: `уникальных сотрудников: ${formatNumber(k.unique_trained)}` },
    { id: "man-hours", label: "Человеко-часов", value: formatNumber(Number(k.man_hours)), hint: "по посещаемости" },
    { id: "certificates", label: "Сертификатов выдано", value: formatNumber(k.certificates_issued), href: "/certificates" },
    { id: "exams", label: "Экзаменов", value: formatNumber(k.exams_total), hint: `сдано: ${formatNumber(k.exams_passed)}`, href: "/exams" },
    { id: "feedback", label: "Обратная связь", value: k.avg_feedback === null ? "—" : formatNumber(Number(k.avg_feedback)), hint: `ответили ${k.answered} из ${k.invited}${k.response_rate === null ? "" : ` (${formatPercent(Number(k.response_rate)).replace(" ", "")})`}`, href: "/feedback" },
    { id: "cost-participant", label: "Стоимость на участника", value: money(k.cost_per_participant === null ? null : Number(k.cost_per_participant)) },
    { id: "cost-hour", label: "Стоимость часа обучения", value: money(k.cost_per_learning_hour === null ? null : Number(k.cost_per_learning_hour)) },
  ];
  return (
    <section aria-label={`Жизненный цикл обучения, ${year}`} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="lifecycle-kpis">
      {tiles.map((t) => {
        const body = (
          <div className="flex h-full min-h-[6.5rem] flex-col gap-2 rounded-xl border bg-card p-4 shadow-xs" data-testid={`lc-${t.id}`}>
            <p className="text-sm font-medium text-muted-foreground">{t.label}</p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums">{t.value}</p>
            {t.hint && <p className="text-xs leading-snug text-muted-foreground">{t.hint}</p>}
          </div>
        );
        return t.href ? <Link key={t.id} href={t.href} className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40">{body}</Link> : <div key={t.id}>{body}</div>;
      })}
    </section>
  );
}
