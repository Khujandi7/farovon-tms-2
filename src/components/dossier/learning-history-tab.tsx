import Link from "next/link";
import { ErrorState } from "@/components/common/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppRole } from "@/lib/auth/roles";
import { formatDateRange, formatMoney, formatNumber } from "@/lib/format";
import { SOURCE_TYPE_LABELS } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";

/**
 * Вкладка «Обучение» (история тренингов): тренинги, в которых сотрудник присутствовал.
 * Данные и вычисления прежние — RPC employee_dossier; подразделение и должность на момент участия.
 */
export async function LearningHistoryTab({ employeeId, role }: { employeeId: string; role: AppRole }) {
  const supabase = await createClient();
  const { data: dossier, error } = await supabase.rpc("employee_dossier", { p_employee: employeeId });
  const showMoney = role !== "HR";
  if (error) return <ErrorState className="bg-card" title="Не удалось загрузить историю обучения" description="Попробуйте обновить страницу." />;
  return (
    <Card data-testid="learning-history">
      <CardHeader>
        <CardTitle>Досье обучения</CardTitle>
        <CardDescription>Тренинги, в которых сотрудник присутствовал. Подразделение и должность — на момент участия.</CardDescription>
      </CardHeader>
      <CardContent>
        {!dossier?.length ? (
          <p className="text-sm text-muted-foreground">Участий пока нет.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Год</TableHead>
                <TableHead>Тренинг</TableHead>
                <TableHead>Даты</TableHead>
                <TableHead className="text-right">Часы</TableHead>
                <TableHead>Источник</TableHead>
                <TableHead>Подразделение на момент участия</TableHead>
                {showMoney && <TableHead className="text-right">Доля затрат</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {dossier.map((d) => (
                <TableRow key={`${d.training_id}-${d.start_date}`}>
                  <TableCell>{d.year}</TableCell>
                  <TableCell className="max-w-72 font-medium whitespace-normal">
                    <Link href={`/trainings/${d.training_id}`} className="hover:text-brand hover:underline">{d.title}</Link>
                  </TableCell>
                  <TableCell>{formatDateRange(d.start_date, d.end_date)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(d.hours)}</TableCell>
                  <TableCell>{SOURCE_TYPE_LABELS[d.source_type]}</TableCell>
                  <TableCell className="whitespace-normal">{[d.department_at_time, d.unit_at_time].filter(Boolean).join(" → ") || "—"}</TableCell>
                  {showMoney && <TableCell className="text-right tabular-nums">{formatMoney(d.cost_share_tjs)}</TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
