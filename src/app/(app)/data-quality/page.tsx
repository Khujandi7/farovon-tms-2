import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { DqIssueCard, type DqIssueView } from "@/components/dq/dq-issue-card";
import { ScanButton } from "@/components/dq/scan-button";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { formatDate } from "@/lib/format";
import { DQ_STATUS_LABELS } from "@/lib/labels";
import { ruleTitle, DQ_RULES } from "@/lib/dq/catalog";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Качество данных" };
export const dynamic = "force-dynamic";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STATUS_FILTERS = ["OPEN", "IN_REVIEW", "CONFIRMED_OK", "IGNORED", "FIXED"] as const;
const SEVERITY_ORDER = { CRITICAL: 0, ERROR: 1, WARNING: 2, INFO: 3 } as const;

export default async function DataQualityPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const statusRaw = one(raw.status);
  const status = (STATUS_FILTERS as readonly string[]).includes(statusRaw ?? "") ? (statusRaw as string) : "active";
  const ruleRaw = one(raw.rule);
  const rule = ruleRaw && ruleRaw in DQ_RULES ? ruleRaw : "";

  return (
    <SectionPage section="data-quality" actions={undefined}>
      {async (session) => {
        const canAct = can(session.role, "dq");
        const supabase = await createClient();
        // Для ADMIN и ACADEMY_MANAGER проверка выполняется при открытии страницы: исправленные данные закрывают проблемы сами.
        if (canAct) await supabase.rpc("dq_scan");

        let q = supabase.from("dq_issues").select("id, rule_code, severity, entity_table, entity_id, message, suggestion, status, details, resolution, updated_at").order("created_at", { ascending: false }).limit(300);
        q = status === "active" ? q.in("status", ["OPEN", "IN_REVIEW"]) : q.eq("status", status);
        if (rule) q = q.eq("rule_code", rule);
        const { data, error } = await q;
        if (error) return <ErrorState className="bg-card" title="Не удалось загрузить замечания" description="Попробуйте обновить страницу." />;

        const issues = ((data ?? []) as unknown as (DqIssueView & { updated_at: string })[]).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.id - a.id);
        const needLinks = canAct && issues.some((i) => ["SRC_PLANNED_NO_REQUEST", "SRC_CANDIDATE_UNCONFIRMED", "REQUEST_NO_TRAINING"].includes(i.rule_code));
        const [reqs, free] = needLinks
          ? await Promise.all([
              supabase.from("training_requests").select("id, canonical_id, topic, plan_year").is("archived_at", null).order("plan_year", { ascending: false }).limit(300),
              supabase.from("trainings").select("id, canonical_id, title, start_date").is("request_id", null).is("archived_at", null).order("start_date", { ascending: false }).limit(300),
            ])
          : [{ data: [] }, { data: [] }];
        const requestChoices = (reqs.data ?? []).map((r) => ({ id: r.id, label: `${r.canonical_id} · ${r.plan_year} · ${r.topic}` }));
        const trainingChoices = (free.data ?? []).map((t) => ({ id: t.id, label: `${t.canonical_id} · ${formatDate(t.start_date)} · ${t.title}` }));

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form method="get" className="flex flex-wrap items-end gap-2" role="search" aria-label="Фильтры замечаний">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Статус
                  <Select name="status" defaultValue={status} className="min-w-44">
                    <option value="active">Требуют внимания</option>
                    {STATUS_FILTERS.map((s) => (
                      <option key={s} value={s}>{DQ_STATUS_LABELS[s]}</option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Правило
                  <Select name="rule" defaultValue={rule} className="min-w-56">
                    <option value="">Все правила</option>
                    {Object.keys(DQ_RULES).map((code) => (
                      <option key={code} value={code}>{ruleTitle(code)}</option>
                    ))}
                  </Select>
                </label>
                <Button type="submit" variant="outline">Применить</Button>
                {(status !== "active" || rule) && <Button asChild variant="ghost"><Link href="/data-quality">Сбросить</Link></Button>}
              </form>
              {canAct && <ScanButton />}
            </div>
            <p className="text-sm text-muted-foreground">
              {issues.length ? `Показано замечаний: ${issues.length}.` : ""} Исправьте данные в карточке — замечание закроется само при следующей проверке. Решения «подтвердить» и «игнорировать» требуют причины.
            </p>
            {issues.length === 0 ? (
              <EmptyState className="bg-card" icon={CheckCircle2} title="Замечаний нет" description="Все проверки пройдены или замечания уже разобраны." />
            ) : (
              <ul className="grid gap-3" data-testid="dq-list">
                {issues.map((i) => (
                  <DqIssueCard key={i.id} issue={i} canAct={canAct} requestChoices={requestChoices} trainingChoices={trainingChoices} />
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </SectionPage>
  );
}
