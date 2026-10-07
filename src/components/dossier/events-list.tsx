"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateRange, formatNumber } from "@/lib/format";
import { TRAINING_STATUS_LABELS, TRAINING_STATUS_VARIANT } from "@/lib/labels";
import { filterByType, typeOptions, type EmployeeEventRow } from "@/lib/trainings/employee-events";
import { PARTICIPANT_RESULT_LABELS, PARTICIPANT_RESULT_VARIANT } from "@/lib/trainings/labels";
import type { ParticipantResult } from "@/lib/workflows/schemas";

/** Список мероприятий сотрудника с фильтром по типу (семинар, форум, конференция…). Фильтр — только состояние страницы. */
export function EventsList({ rows }: { rows: EmployeeEventRow[] }) {
  const [type, setType] = useState("");
  const options = useMemo(() => typeOptions(rows), [rows]);
  const shown = useMemo(() => filterByType(rows, type), [rows, type]);

  return (
    <div className="space-y-3" data-testid="employee-events">
      {options.length > 1 && (
        <div className="grid max-w-xs gap-1">
          <Label htmlFor="events-type" className="text-xs text-muted-foreground">Тип мероприятия</Label>
          <Select id="events-type" value={type} onChange={(e) => setType(e.target.value)} data-testid="events-type-filter">
            <option value="">Все типы ({rows.length})</option>
            {options.map((o) => (
              <option key={o.code} value={o.code}>{o.name} ({o.count})</option>
            ))}
          </Select>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">Мероприятий этого типа нет.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Мероприятие</TableHead>
              <TableHead>Тип</TableHead>
              <TableHead>Даты</TableHead>
              <TableHead className="text-right">Часы</TableHead>
              <TableHead>Провайдер / организатор</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Итог</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => {
              const res = r.result && r.result in PARTICIPANT_RESULT_LABELS ? (r.result as ParticipantResult) : null;
              const status = r.status in TRAINING_STATUS_LABELS ? (r.status as keyof typeof TRAINING_STATUS_LABELS) : null;
              return (
                <TableRow key={r.participantId} data-testid="event-row">
                  <TableCell className="max-w-72 font-medium whitespace-normal">
                    <Link href={`/trainings/${r.trainingId}`} className="hover:text-brand hover:underline">{r.title}</Link>
                    <span className="block font-mono text-xs font-normal text-muted-foreground">{r.code}</span>
                    {r.archived && <Badge variant="outline">Архив</Badge>}
                  </TableCell>
                  <TableCell className="whitespace-normal">{r.typeName}</TableCell>
                  <TableCell>{formatDateRange(r.startDate, r.endDate)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.hours)}</TableCell>
                  <TableCell className="whitespace-normal">{[r.provider, r.organizer].filter(Boolean).join(" / ") || "—"}</TableCell>
                  <TableCell>{status ? <Badge variant={TRAINING_STATUS_VARIANT[status]}>{TRAINING_STATUS_LABELS[status]}</Badge> : "—"}</TableCell>
                  <TableCell className="whitespace-normal">
                    {res ? <Badge variant={PARTICIPANT_RESULT_VARIANT[res]}>{PARTICIPANT_RESULT_LABELS[res]}</Badge> : !r.attended ? <Badge variant="outline">Не присутствовал</Badge> : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
