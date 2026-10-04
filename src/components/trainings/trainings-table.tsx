"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateRange, formatNumber } from "@/lib/format";
import { SOURCE_TYPE_LABELS, TRAINING_FORMAT_LABELS, TRAINING_STATUS_LABELS, TRAINING_STATUS_VARIANT } from "@/lib/labels";
import type { Database } from "@/types/database";

type T = Database["public"]["Tables"]["trainings"]["Row"];
export type TrainingListRow = Pick<T, "id" | "canonical_id" | "title" | "start_date" | "end_date" | "hours" | "status" | "source_type" | "format">;

const columns: ColumnDef<TrainingListRow, unknown>[] = [
  { accessorKey: "canonical_id", header: "Код", cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.canonical_id}</span> },
  { accessorKey: "title", header: "Название", cell: ({ row }) => <span className="font-medium">{row.original.title}</span> },
  { accessorKey: "start_date", header: "Даты", cell: ({ row }) => formatDateRange(row.original.start_date, row.original.end_date) },
  { accessorKey: "hours", header: "Часы", cell: ({ row }) => <span className="tabular-nums">{formatNumber(row.original.hours)}</span> },
  { accessorKey: "format", header: "Формат", cell: ({ row }) => TRAINING_FORMAT_LABELS[row.original.format] },
  { accessorKey: "source_type", header: "Источник", cell: ({ row }) => SOURCE_TYPE_LABELS[row.original.source_type] },
  {
    accessorKey: "status",
    header: "Статус",
    cell: ({ row }) => <Badge variant={TRAINING_STATUS_VARIANT[row.original.status]}>{TRAINING_STATUS_LABELS[row.original.status]}</Badge>,
  },
];

export function TrainingsTable({ data }: { data: TrainingListRow[] }) {
  return (
    <DataTable
      columns={columns}
      data={data}
      searchPlaceholder="Поиск по названию или коду…"
      emptyTitle="Обучений пока нет"
      emptyDescription="Записи появятся после ввода тренингов или импорта реестра (следующие этапы Phase 2)."
    />
  );
}
