import Link from "next/link";
import { ErrorState } from "@/components/common/states";
import { IndividualEducationDialog } from "@/components/dossier/individual-education-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppRole } from "@/lib/auth/roles";
import { formatDateRange, formatMoney, formatNumber } from "@/lib/format";
import { TRAINING_STATUS_LABELS, TRAINING_STATUS_VARIANT } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { INDIVIDUAL_TYPE_CODE } from "@/lib/trainings/employee-events";
import { PARTICIPANT_RESULT_LABELS, PARTICIPANT_RESULT_VARIANT } from "@/lib/trainings/labels";
import { loadProviders } from "@/lib/trainings/load-references";
import { loadEmployeeEvents } from "@/lib/trainings/load-employee-events";
import { can } from "@/lib/workflows/roles";
import type { ParticipantResult } from "@/lib/workflows/schemas";

/** Вкладка «Индивидуальное обучение»: мероприятия типа INDIVIDUAL_EDUCATION. Расходы остаются в обычном потоке расходов мероприятия. */
export async function IndividualEducationTab({ employeeId, role }: { employeeId: string; role: AppRole }) {
  const { rows, failed } = await loadEmployeeEvents(employeeId);
  if (failed) return <ErrorState className="bg-card" title="Не удалось загрузить индивидуальное обучение" description="Попробуйте обновить страницу." />;
  const items = rows.filter((r) => r.typeCode === INDIVIDUAL_TYPE_CODE);
  const canAdd = can(role, "training");
  const moneyAllowed = can(role, "financialRead");

  let costs = new Map<string, number | null>();
  if (moneyAllowed && items.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase.from("v_training_list").select("id, actual_tjs").in("id", items.map((i) => i.trainingId));
    costs = new Map((data ?? []).map((c) => [c.id as string, c.actual_tjs === null ? null : Number(c.actual_tjs)]));
  }
  const providers = canAdd ? await loadProviders() : [];

  return (
    <Card data-testid="individual-tab">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle>Индивидуальное обучение</CardTitle>
          <CardDescription>Курсы, экзамены-подготовка и другое обучение сотрудника «один на один». Расходы вносятся в карточке мероприятия.</CardDescription>
        </div>
        {canAdd && <IndividualEducationDialog employeeId={employeeId} providers={providers.map((p) => ({ id: p.id, name: p.name }))} />}
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Индивидуального обучения пока нет.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Мероприятие</TableHead>
                <TableHead>Даты</TableHead>
                <TableHead className="text-right">Часы</TableHead>
                <TableHead>Провайдер / организатор</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead>Итог</TableHead>
                <TableHead className="text-right">Расходы, TJS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((r) => {
                const res = r.result && r.result in PARTICIPANT_RESULT_LABELS ? (r.result as ParticipantResult) : null;
                const status = r.status in TRAINING_STATUS_LABELS ? (r.status as keyof typeof TRAINING_STATUS_LABELS) : null;
                return (
                  <TableRow key={r.participantId} data-testid="individual-row">
                    <TableCell className="max-w-72 font-medium whitespace-normal">
                      <Link href={`/trainings/${r.trainingId}`} className="hover:text-brand hover:underline">{r.title}</Link>
                      <span className="block font-mono text-xs font-normal text-muted-foreground">{r.code}</span>
                    </TableCell>
                    <TableCell>{formatDateRange(r.startDate, r.endDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.hours)}</TableCell>
                    <TableCell className="whitespace-normal">{[r.provider, r.organizer].filter(Boolean).join(" / ") || "—"}</TableCell>
                    <TableCell>{status ? <Badge variant={TRAINING_STATUS_VARIANT[status]}>{TRAINING_STATUS_LABELS[status]}</Badge> : "—"}</TableCell>
                    <TableCell>{res ? <Badge variant={PARTICIPANT_RESULT_VARIANT[res]}>{PARTICIPANT_RESULT_LABELS[res]}</Badge> : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {moneyAllowed ? (
                        <Link href={`/trainings/${r.trainingId}?tab=expenses`} className="hover:text-brand hover:underline">{formatMoney(costs.get(r.trainingId) ?? null, "")}</Link>
                      ) : (
                        <span className="text-xs text-muted-foreground">нет доступа к суммам</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
