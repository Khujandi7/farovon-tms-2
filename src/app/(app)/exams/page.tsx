import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Award } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { NewExamDialog } from "@/components/exams/new-exam-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";
import { EXAM_RESULTS, EXAM_RESULT_LABELS, examResultLabel, examResultTone, examStatusLabel, formatAttempt, formatScore } from "@/lib/exams/format";
import { EXAMS_PAGE_SIZE, examListQuery, parseExamListParams } from "@/lib/exams/list-params";
import { loadProviderOptions, loadSkillOptions } from "@/lib/exams/options";

export const metadata: Metadata = { title: "Экзамены" };
export const dynamic = "force-dynamic";

type Search = Promise<Record<string, string | string[] | undefined>>;

export default async function ExamsPage({ searchParams }: { searchParams: Search }) {
  const p = parseExamListParams(await searchParams);
  return (
    <SectionPage section="exams">
      {async (session) => {
        const supabase = await createClient();
        const showCost = can(session.role, "examCost");
        const canEdit = can(session.role, "exam");
        let req = supabase
          .from("exams")
          .select(
            `id, canonical_id, attempt_no, exam_date, status, result, score, employee_id, skill_id, provider_id,
             employee:employees${p.q ? "!inner" : ""}(id, full_name), skill:skills(id, name), provider:learning_providers(id, name)`,
            { count: "exact" },
          )
          .is("archived_at", null)
          .order("exam_date", { ascending: false })
          .order("canonical_id", { ascending: false })
          .range((p.page - 1) * EXAMS_PAGE_SIZE, p.page * EXAMS_PAGE_SIZE - 1);
        if (p.result) req = req.eq("result", p.result);
        if (p.skill) req = req.eq("skill_id", p.skill);
        if (p.provider) req = req.eq("provider_id", p.provider);
        if (p.year) req = req.gte("exam_date", `${p.year}-01-01`).lte("exam_date", `${p.year}-12-31`);
        if (p.q) req = req.ilike("employees.full_name", `%${p.q}%`);

        const [{ data, error, count }, skills, providers] = await Promise.all([req, loadSkillOptions(supabase, { onlyActive: false }), loadProviderOptions(supabase)]);
        const rows = data ?? [];
        const costs = new Map<string, { fee: number; currency: string; fee_tjs: number | null }>();
        if (showCost && rows.length) {
          const { data: cs } = await supabase.from("exam_costs").select("exam_id, fee, currency, fee_tjs").in("exam_id", rows.map((r) => r.id));
          for (const c of cs ?? []) costs.set(c.exam_id, { fee: Number(c.fee), currency: c.currency, fee_tjs: c.fee_tjs === null ? null : Number(c.fee_tjs) });
        }
        const total = count ?? 0;
        const pages = Math.max(1, Math.ceil(total / EXAMS_PAGE_SIZE));
        const thisYear = new Date().getFullYear();
        const filtered = !!(p.result || p.q || p.skill || p.year || p.provider);

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form method="get" className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-end" role="search" aria-label="Фильтры экзаменов">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Сотрудник
                  <Input name="q" defaultValue={p.q} placeholder="Поиск по ФИО" className="h-10 sm:min-w-48" />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Результат
                  <Select name="result" defaultValue={p.result ?? ""} className="h-10 sm:min-w-36">
                    <option value="">Все</option>
                    {EXAM_RESULTS.map((r) => (
                      <option key={r} value={r}>{EXAM_RESULT_LABELS[r]}</option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Квалификация
                  <Select name="skill" defaultValue={p.skill ? String(p.skill) : ""} className="h-10 sm:min-w-44">
                    <option value="">Все</option>
                    {skills.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Год
                  <Select name="year" defaultValue={p.year ? String(p.year) : ""} className="h-10 sm:min-w-28">
                    <option value="">Все</option>
                    {Array.from({ length: 8 }, (_, i) => thisYear + 1 - i).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Провайдер
                  <Select name="provider" defaultValue={p.provider ?? ""} className="h-10 sm:min-w-44">
                    <option value="">Все</option>
                    {providers.map((pr) => (
                      <option key={pr.id} value={pr.id}>{pr.name}</option>
                    ))}
                  </Select>
                </label>
                <div className="flex gap-2">
                  <Button type="submit" variant="outline" className="h-10">Применить</Button>
                  {filtered && <Button asChild variant="ghost" className="h-10"><Link href="/exams">Сбросить</Link></Button>}
                </div>
              </form>
              {canEdit && <NewExamDialog skills={skills.filter((s) => s.is_active)} providers={providers} />}
            </div>

            {error ? (
              <ErrorState className="bg-card" title="Не удалось загрузить экзамены" description="Попробуйте обновить страницу." />
            ) : !rows.length ? (
              <EmptyState className="bg-card" icon={Award} title={filtered ? "Ничего не найдено" : "Экзаменов пока нет"} description={filtered ? "Измените фильтры." : "Добавьте первую попытку кнопкой «Новый экзамен»."} />
            ) : (
              <>
                <div className="hidden rounded-xl border bg-card shadow-xs md:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Код</TableHead>
                        <TableHead>Сотрудник</TableHead>
                        <TableHead>Квалификация</TableHead>
                        <TableHead>Попытка</TableHead>
                        <TableHead>Дата</TableHead>
                        <TableHead>Провайдер</TableHead>
                        <TableHead>Результат</TableHead>
                        <TableHead className="text-right">Балл</TableHead>
                        {showCost && <TableHead className="text-right">Стоимость</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((e) => {
                        const cost = costs.get(e.id);
                        return (
                          <TableRow key={e.id} data-testid="exam-row">
                            <TableCell className="font-mono text-xs"><Link href={`/exams/${e.id}`} className="hover:text-brand hover:underline">{e.canonical_id}</Link></TableCell>
                            <TableCell className="font-medium"><Link href={`/employees/${e.employee_id}`} className="hover:text-brand hover:underline">{e.employee?.full_name ?? "—"}</Link></TableCell>
                            <TableCell>{e.skill?.name ?? "—"}</TableCell>
                            <TableCell>{formatAttempt(e.attempt_no)}</TableCell>
                            <TableCell>{formatDate(e.exam_date)}</TableCell>
                            <TableCell>{e.provider?.name ?? "—"}</TableCell>
                            <TableCell>
                              <Badge variant={examResultTone(e.result)}>{examResultLabel(e.result)}</Badge>
                              {e.status === "CANCELLED" && <Badge variant="outline" className="ml-1">{examStatusLabel(e.status)}</Badge>}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{formatScore(e.score)}</TableCell>
                            {showCost && <TableCell className="text-right tabular-nums">{cost ? formatMoney(cost.fee, cost.currency) : "—"}</TableCell>}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <ul className="grid gap-3 md:hidden" aria-label="Экзамены">
                  {rows.map((e) => {
                    const cost = costs.get(e.id);
                    return (
                      <li key={e.id} className="rounded-xl border bg-card p-3 text-sm shadow-xs" data-testid="exam-card">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/exams/${e.id}`} className="min-h-10 font-medium hover:text-brand">{e.employee?.full_name ?? "—"}</Link>
                          <Badge variant={examResultTone(e.result)}>{examResultLabel(e.result)}</Badge>
                        </div>
                        <p className="text-muted-foreground">{e.skill?.name ?? "—"} · {formatAttempt(e.attempt_no)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(e.exam_date)} · {e.provider?.name ?? "без провайдера"} · {e.canonical_id}</p>
                        {(e.score !== null || (showCost && cost)) && (
                          <p className="mt-1 text-xs">{e.score !== null && <>Балл: {formatScore(e.score)}</>}{showCost && cost && <> · {formatMoney(cost.fee, cost.currency)}</>}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {total > EXAMS_PAGE_SIZE && (
              <nav aria-label="Страницы" className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Всего: {total}. Страница {p.page} из {pages}</span>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" className={p.page <= 1 ? "pointer-events-none opacity-50" : undefined}><Link href={`/exams${examListQuery(p, p.page - 1)}`}><ChevronLeft /> Назад</Link></Button>
                  <Button asChild variant="outline" size="sm" className={p.page >= pages ? "pointer-events-none opacity-50" : undefined}><Link href={`/exams${examListQuery(p, p.page + 1)}`}>Вперёд <ChevronRight /></Link></Button>
                </div>
              </nav>
            )}
          </div>
        );
      }}
    </SectionPage>
  );
}
