import Link from "next/link";
import { Award } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/states";
import { NewExamDialog } from "@/components/exams/new-exam-dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppRole } from "@/lib/auth/roles";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";
import { examResultLabel, examResultTone, examStatusLabel, formatAttempt, formatScore } from "@/lib/exams/format";
import { loadProviderOptions, loadSkillOptions } from "@/lib/exams/options";

/** Вкладка «Экзамены» досье: все попытки сотрудника (каждая — отдельная запись) и кнопка добавления. */
export async function ExamsTab({ employeeId, role }: { employeeId: string; role: AppRole }) {
  const supabase = await createClient();
  const showCost = can(role, "examCost");
  const canEdit = can(role, "exam");
  const [{ data, error }, skills, providers] = await Promise.all([
    supabase
      .from("exams")
      .select("id, canonical_id, attempt_no, exam_date, status, result, score, skill:skills(name), provider:learning_providers(name)")
      .eq("employee_id", employeeId)
      .is("archived_at", null)
      .order("exam_date", { ascending: false })
      .order("attempt_no", { ascending: false }),
    canEdit ? loadSkillOptions(supabase) : Promise.resolve([]),
    canEdit ? loadProviderOptions(supabase) : Promise.resolve([]),
  ]);
  const rows = data ?? [];
  const costs = new Map<string, { fee: number; currency: string }>();
  if (showCost && rows.length) {
    const { data: cs } = await supabase.from("exam_costs").select("exam_id, fee, currency").in("exam_id", rows.map((r) => r.id));
    for (const c of cs ?? []) costs.set(c.exam_id, { fee: Number(c.fee), currency: c.currency });
  }

  return (
    <section className="space-y-3" aria-label="Экзамены сотрудника" data-testid="exams-tab">
      {canEdit && (
        <div className="flex justify-end">
          <NewExamDialog skills={skills} providers={providers} employee={{ id: employeeId }} />
        </div>
      )}
      {error ? (
        <ErrorState className="bg-card" compact title="Не удалось загрузить экзамены" />
      ) : !rows.length ? (
        <EmptyState className="bg-card" compact icon={Award} title="Экзаменов нет" description="Попытки появятся здесь после добавления." />
      ) : (
        <>
          <div className="hidden rounded-xl border bg-card shadow-xs md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
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
                {rows.map((r) => {
                  const c = costs.get(r.id);
                  return (
                    <TableRow key={r.id} data-testid="dossier-exam-row">
                      <TableCell className="font-medium"><Link href={`/exams/${r.id}`} className="hover:text-brand hover:underline">{r.skill?.name ?? "—"}</Link></TableCell>
                      <TableCell>{formatAttempt(r.attempt_no)}</TableCell>
                      <TableCell>{formatDate(r.exam_date)}</TableCell>
                      <TableCell>{r.provider?.name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant={examResultTone(r.result)}>{examResultLabel(r.result)}</Badge>
                        {r.status === "CANCELLED" && <Badge variant="outline" className="ml-1">{examStatusLabel(r.status)}</Badge>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatScore(r.score)}</TableCell>
                      {showCost && <TableCell className="text-right tabular-nums">{c ? formatMoney(c.fee, c.currency) : "—"}</TableCell>}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <ul className="grid gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border bg-card p-3 text-sm shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/exams/${r.id}`} className="min-h-10 font-medium hover:text-brand">{r.skill?.name ?? "—"} · {formatAttempt(r.attempt_no)}</Link>
                  <Badge variant={examResultTone(r.result)}>{examResultLabel(r.result)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(r.exam_date)} · {r.provider?.name ?? "без провайдера"}{r.score !== null && ` · балл ${formatScore(r.score)}`}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
