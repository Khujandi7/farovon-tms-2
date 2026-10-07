import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, HandCoins, Plus, ScrollText } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LegalWarning } from "@/components/funding/legal-warning";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { OBLIGATION_STATUSES, outstandingAmount, summarizeAgreements } from "@/lib/funding/calc";
import { FUNDING_PAGE_SIZE, fundingQuery, parseFundingParams, safeLike, type FundingParams } from "@/lib/funding/params";
import { AGREEMENT_STATUSES, AGREEMENT_STATUS_LABELS, agreementStatusLabel, agreementStatusVariant } from "@/lib/funding/status";
import { createClient } from "@/lib/supabase/server";
import { availableYears } from "@/lib/years";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Финансирование" };
export const dynamic = "force-dynamic";

type Search = Record<string, string | string[] | undefined>;

export default async function FundingPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = parseFundingParams(await searchParams);
  return (
    <SectionPage
      section="funding"
      actions={
        <>
          <Button asChild variant="outline" size="sm" className="min-h-10">
            <Link href="/funding/policies"><ScrollText /> Политики</Link>
          </Button>
        </>
      }
    >
      {async (session) => <Registry params={params} canCreate={can(session.role, "agreement")} />}
    </SectionPage>
  );
}

async function Registry({ params, canCreate }: { params: FundingParams; canCreate: boolean }) {
  const supabase = await createClient();

  // Поиск по сотруднику: сначала находим подходящих сотрудников, затем фильтруем соглашения.
  let employeeIds: string[] = [];
  const like = safeLike(params.q);
  if (like) {
    const { data } = await supabase.from("employees").select("id").ilike("full_name", `%${like}%`).limit(200);
    employeeIds = (data ?? []).map((e) => e.id);
  }

  const cols = "id, canonical_id, employee_id, training_id, exam_id, status, total_cost, currency, total_cost_tjs, company_coverage_percent, company_funded_amount, repayment_amount, cost_date, reviewed_at";
  const run = (paged: boolean) => {
    let q = supabase.from("learning_agreements").select(cols, paged ? { count: "exact" } : undefined).order("cost_date", { ascending: false }).order("canonical_id", { ascending: false });
    if (params.status) q = q.eq("status", params.status);
    if (params.year) q = q.gte("cost_date", `${params.year}-01-01`).lte("cost_date", `${params.year}-12-31`);
    if (like) q = employeeIds.length ? q.or(`canonical_id.ilike.%${like}%,employee_id.in.(${employeeIds.join(",")})`) : q.or(`canonical_id.ilike.%${like}%`);
    return paged ? q.range((params.page - 1) * FUNDING_PAGE_SIZE, params.page * FUNDING_PAGE_SIZE - 1) : q.limit(5000);
  };
  const [pageRes, allRes, repRes] = await Promise.all([
    run(true),
    run(false),
    supabase.from("agreement_repayments").select("agreement_id, amount").is("voided_at", null).limit(20000),
  ]);

  const rows = pageRes.data ?? [];
  const repaid: Record<string, number> = {};
  for (const r of repRes.data ?? []) repaid[r.agreement_id] = (repaid[r.agreement_id] ?? 0) + r.amount;
  const totals = summarizeAgreements(allRes.data ?? [], repaid);

  const empIds = [...new Set(rows.map((r) => r.employee_id))];
  const trIds = [...new Set(rows.map((r) => r.training_id).filter((x): x is string => !!x))];
  const exIds = [...new Set(rows.map((r) => r.exam_id).filter((x): x is string => !!x))];
  const [emps, trs, exs] = await Promise.all([
    empIds.length ? supabase.from("employees").select("id, full_name").in("id", empIds) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    trIds.length ? supabase.from("trainings").select("id, title").in("id", trIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    exIds.length ? supabase.from("exams").select("id, canonical_id").in("id", exIds) : Promise.resolve({ data: [] as { id: string; canonical_id: string }[] }),
  ]);
  const empName = new Map((emps.data ?? []).map((e) => [e.id, e.full_name]));
  const trName = new Map((trs.data ?? []).map((t) => [t.id, t.title]));
  const exName = new Map((exs.data ?? []).map((x) => [x.id, x.canonical_id]));

  const total = pageRes.count ?? 0;
  const pages = Math.max(1, Math.ceil(total / FUNDING_PAGE_SIZE));
  const filtered = !!(params.status || params.year || params.q);

  return (
    <div className="space-y-4">
      <LegalWarning compact />

      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="funding-totals">
        {[
          ["Стоимость, TJS", totals.totalTjs],
          ["Оплатила компания, TJS", totals.companyTjs],
          ["Доля сотрудников, TJS", totals.employeeTjs],
          ["Непогашено, TJS", totals.outstandingTjs],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-3 shadow-xs">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{formatMoney(value as number, "")}</dd>
          </div>
        ))}
      </dl>
      {totals.skipped > 0 && <p className="text-xs text-muted-foreground">Соглашений без курса пересчёта в TJS: {totals.skipped} — они не вошли в итоги.</p>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <form method="get" className="flex flex-wrap items-end gap-2" role="search" aria-label="Фильтры соглашений">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Год расходов
            <Select name="year" defaultValue={params.year ? String(params.year) : ""} className="h-10 min-w-28">
              <option value="">Все годы</option>
              {availableYears().map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Статус
            <Select name="status" defaultValue={params.status ?? ""} className="h-10 min-w-44">
              <option value="">Любой</option>
              {AGREEMENT_STATUSES.map((s) => <option key={s} value={s}>{AGREEMENT_STATUS_LABELS[s]}</option>)}
            </Select>
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Сотрудник или код
            <Input name="q" defaultValue={params.q} placeholder="ФИО или AGR-…" className="h-10 min-w-48" />
          </label>
          <Button type="submit" variant="outline" className="min-h-10">Применить</Button>
          {filtered && <Button asChild variant="ghost" className="min-h-10"><Link href="/funding">Сбросить</Link></Button>}
        </form>
        {canCreate && (
          <Button asChild className="min-h-10">
            <Link href="/funding/new" data-testid="new-agreement-link"><Plus /> Новое соглашение</Link>
          </Button>
        )}
      </div>

      {pageRes.error ? (
        <ErrorState className="bg-card" title="Не удалось загрузить соглашения" description="Попробуйте обновить страницу." />
      ) : rows.length === 0 ? (
        <EmptyState className="bg-card" icon={HandCoins} title={filtered ? "Ничего не найдено" : "Соглашений пока нет"} description={canCreate ? "Создайте соглашение кнопкой «Новое соглашение» или на вкладке «Договоры» в досье сотрудника." : "Измените фильтры или дождитесь появления записей."} />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Код</TableHead>
                <TableHead>Сотрудник</TableHead>
                <TableHead>Предмет</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Стоимость</TableHead>
                <TableHead className="text-right">Компания</TableHead>
                <TableHead className="text-right">Сотрудник</TableHead>
                <TableHead className="text-right">Непогашено</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const hasObligation = (OBLIGATION_STATUSES as readonly string[]).includes(r.status);
                const out = hasObligation ? outstandingAmount(r.repayment_amount, repaid[r.id] ?? 0) : null;
                return (
                  <TableRow key={r.id} data-testid="agreement-row">
                    <TableCell className="font-medium whitespace-nowrap">
                      <Link href={`/funding/${r.id}`} className="py-2 hover:text-brand hover:underline">{r.canonical_id}</Link>
                      <p className="text-xs font-normal text-muted-foreground">{formatDate(r.cost_date)}</p>
                    </TableCell>
                    <TableCell className="max-w-56 whitespace-normal"><Link href={`/employees/${r.employee_id}`} className="hover:text-brand hover:underline">{empName.get(r.employee_id) ?? "—"}</Link></TableCell>
                    <TableCell className="max-w-64 whitespace-normal">{r.training_id ? (trName.get(r.training_id) ?? "Обучение") : r.exam_id ? `Экзамен ${exName.get(r.exam_id) ?? ""}`.trim() : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={agreementStatusVariant(r.status)}>{agreementStatusLabel(r.status)}</Badge>
                      {hasObligation && !r.reviewed_at && <p className="mt-1 text-xs text-warning">Ждёт проверки</p>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(r.total_cost, r.currency)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(r.company_funded_amount, r.currency)}<p className="text-xs text-muted-foreground">{formatPercent(r.company_coverage_percent)}</p></TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{formatMoney(Math.round((r.total_cost - r.company_funded_amount) * 100) / 100, r.currency)}<p className="text-xs text-muted-foreground">{formatPercent(100 - r.company_coverage_percent)}</p></TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">{out === null ? "—" : formatMoney(out, r.currency)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 && (
        <nav className="flex items-center justify-between text-sm" aria-label="Страницы">
          <span className="text-muted-foreground">Страница {params.page} из {pages} · всего {total}</span>
          <div className="flex gap-2">
            {params.page > 1 && <Button asChild variant="outline" size="sm" className="min-h-10"><Link href={`/funding${fundingQuery(params, { page: params.page - 1 })}`}><ChevronLeft /> Назад</Link></Button>}
            {params.page < pages && <Button asChild variant="outline" size="sm" className="min-h-10"><Link href={`/funding${fundingQuery(params, { page: params.page + 1 })}`}>Далее <ChevronRight /></Link></Button>}
          </div>
        </nav>
      )}
    </div>
  );
}
