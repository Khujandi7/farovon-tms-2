"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { EmptyState } from "@/components/common/states";
import { describeAudit, isRevertCandidate, type AuditLookup, type AuditRow } from "@/lib/audit/describe";
import { revertChange } from "@/app/(app)/trainings/actions";
import { canRevertTable } from "@/lib/workflows/roles";
import type { AppRole } from "@/lib/auth/roles";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Журнал изменений сущности: кто, когда, что, было → стало, причина. ↶ откатывает конкретное изменение (с причиной). */
export function AuditTimeline({ rows, lookup, role, entityPath }: { rows: AuditRow[]; lookup: AuditLookup; role: AppRole; entityPath: string }) {
  const router = useRouter();
  const [target, setTarget] = useState<AuditRow | null>(null);

  if (rows.length === 0) return <EmptyState className="bg-card" compact title="Изменений пока нет" description="Все правки данных появятся здесь с автором и причиной." />;

  return (
    <>
      <ol className="space-y-3" data-testid="audit-list">
        {rows.map((row) => {
          const view = describeAudit(row, lookup);
          const revertable = isRevertCandidate(row) && canRevertTable(role, row.table_name);
          return (
            <li key={row.id} className="rounded-lg border bg-card p-3 text-sm shadow-xs" data-testid="audit-row">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">
                    {view.title}
                    {view.subject && <span className="font-normal text-muted-foreground"> · {view.subject}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.user_name ?? "Система"} · {formatWhen(row.at)}
                  </p>
                </div>
                {revertable && (
                  <Button type="button" size="sm" variant="outline" onClick={() => setTarget(row)} aria-label={`Отменить изменение от ${formatWhen(row.at)}`} data-testid="revert-button">
                    <Undo2 aria-hidden="true" /> Отменить
                  </Button>
                )}
              </div>
              {view.lines.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {view.lines.map((l) => (
                    <li key={l.field} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                      <span className="text-muted-foreground">{l.label}:</span>
                      <span className="line-through opacity-70">{l.before}</span>
                      <ArrowRight className="size-3 self-center text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{l.after}</span>
                    </li>
                  ))}
                </ul>
              )}
              {row.reason && (
                <p className="mt-2 rounded-md bg-muted px-2 py-1 text-xs">
                  <span className="text-muted-foreground">Причина: </span>
                  {row.reason}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <ReasonDialog
        open={target !== null}
        title="Отменить изменение"
        description="Значения вернутся к прежним. Если поле уже менялось позже, откат будет отклонён. Сам откат тоже попадёт в журнал."
        confirmLabel="Отменить изменение"
        testId="revert-dialog"
        onClose={() => setTarget(null)}
        onConfirm={(reason) => revertChange({ auditId: target?.id ?? 0, entityPath, reason })}
        onDone={() => router.refresh()}
      >
        {target && (
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            {describeAudit(target, lookup).title} · {describeAudit(target, lookup).subject}
          </div>
        )}
      </ReasonDialog>
    </>
  );
}
