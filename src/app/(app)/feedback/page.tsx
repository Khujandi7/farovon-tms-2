import type { Metadata } from "next";
import Link from "next/link";
import { MessageSquareText } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { YearFilter } from "@/components/dashboard/year-filter";
import { formatDecimal } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { availableYears, parseYear } from "@/lib/years";

export const metadata: Metadata = { title: "Обратная связь" };
export const dynamic = "force-dynamic";

/** Обратная связь по проведённым обучениям года: приглашено / ответило / доля / итог. Источник — training_feedback_summary (БД); оценки скрыты ниже порога анонимности. */
export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ year?: string | string[] }> }) {
  const year = parseYear((await searchParams).year);
  return (
    <SectionPage section="feedback" actions={<YearFilter years={availableYears()} selected={year} basePath="/feedback" />}>
      {async () => {
        const supabase = await createClient();
        const { data: trainings, error } = await supabase
          .from("v_training_list")
          .select("id, canonical_id, title, start_date")
          .is("archived_at", null)
          .eq("status", "COMPLETED")
          .gte("start_date", `${year}-01-01`)
          .lte("start_date", `${year}-12-31`)
          .order("start_date", { ascending: false })
          .limit(60);
        if (error) return <ErrorState className="bg-card" title="Не удалось загрузить обучения" description="Попробуйте обновить страницу." />;
        const rows = await Promise.all(
          (trainings ?? []).filter((t): t is typeof t & { id: string } => !!t.id).map(async (t) => {
            const { data } = await supabase.rpc("training_feedback_summary", { p_training: t.id });
            return { t, s: data?.[0] };
          }),
        );
        const withData = rows.filter((r) => r.s && (r.s.invited > 0 || r.s.answered > 0));
        if (withData.length === 0) {
          return <EmptyState className="bg-card" icon={MessageSquareText} title={`За ${year} год обратной связи пока нет`} description="Запросите её на вкладке «Обратная связь» карточки проведённого обучения." />;
        }
        return (
          <ul className="divide-y rounded-xl border bg-card shadow-xs" data-testid="feedback-list">
            {withData.map(({ t, s }) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm" data-testid="feedback-row">
                <div className="min-w-0">
                  <Link href={`/trainings/${t.id}?tab=feedback`} className="font-medium hover:text-brand hover:underline">{t.canonical_id} · {t.title}</Link>
                  <p className="text-xs text-muted-foreground">Приглашено {s!.invited} · ответило {s!.answered}{s!.response_rate === null ? "" : ` · ${formatDecimal(Number(s!.response_rate))}%`}</p>
                </div>
                <span className="tabular-nums">{s!.scores_hidden ? "оценка скрыта" : s!.final_score === null ? "—" : `Итог: ${formatDecimal(Number(s!.final_score))}`}</span>
              </li>
            ))}
          </ul>
        );
      }}
    </SectionPage>
  );
}
