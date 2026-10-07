"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/states";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { voidRepayment } from "@/app/(app)/funding/actions";
import { formatDate, formatMoney } from "@/lib/format";

export type RepaymentRow = { id: string; amount: number; paid_on: string; comment: string | null; voided_at: string | null; void_reason: string | null; created_by_name: string | null };

/** История погашений. Погашение неизменяемо: ошибочное аннулируется с причиной и вносится заново. */
export function RepaymentsPanel({ agreementId, currency, rows, canVoid }: { agreementId: string; currency: string; rows: RepaymentRow[]; canVoid: boolean }) {
  const router = useRouter();
  const [target, setTarget] = useState<RepaymentRow | null>(null);
  if (rows.length === 0) return <EmptyState className="bg-card" compact title="Погашений пока нет" />;
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card shadow-xs" data-testid="repayments-list">
        {rows.map((r) => (
          <li key={r.id} className={"flex flex-wrap items-start justify-between gap-2 px-3 py-2.5 text-sm" + (r.voided_at ? " opacity-60" : "")} data-testid="repayment-row">
            <div className="min-w-0">
              <p className="font-medium">
                <span className={r.voided_at ? "line-through" : ""}>{formatMoney(r.amount, currency)}</span>
                {r.voided_at && <Badge variant="outline" className="ml-2">Аннулировано</Badge>}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(r.paid_on)}
                {r.created_by_name ? ` · внёс ${r.created_by_name}` : ""}
                {r.comment ? ` · ${r.comment}` : ""}
                {r.void_reason ? ` · причина аннулирования: ${r.void_reason}` : ""}
              </p>
            </div>
            {canVoid && !r.voided_at && (
              <Button size="sm" variant="ghost" className="min-h-10" onClick={() => setTarget(r)} aria-label={`Аннулировать погашение ${formatMoney(r.amount, currency)}`} data-testid="void-repayment">
                <Ban aria-hidden="true" /> Аннулировать
              </Button>
            )}
          </li>
        ))}
      </ul>
      <ReasonDialog
        open={!!target}
        title="Аннулировать погашение"
        description="Запись останется в истории. Статус обязательства будет пересчитан."
        confirmLabel="Аннулировать"
        destructive
        testId="void-repayment-dialog"
        onClose={() => setTarget(null)}
        onConfirm={(reason) => voidRepayment({ id: target!.id, agreementId, reason }).then((r) => (r.ok ? { ok: true as const, message: r.message } : { ok: false as const, error: r.error }))}
        onDone={() => router.refresh()}
      />
    </>
  );
}
