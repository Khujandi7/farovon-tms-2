import { Lock, AlertCircle } from "lucide-react";
import type { KpiCardModel } from "@/lib/dashboard/kpi";
import { cn } from "@/lib/utils";

export function KpiCard({ card }: { card: KpiCardModel }) {
  const muted = card.state !== "value";
  return (
    <div
      className="flex min-h-[7.5rem] flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs sm:p-5"
      data-testid={`kpi-${card.id}`}
      data-state={card.state}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
        {card.state === "restricted" && <Lock className="size-4 text-muted-foreground" aria-label="Ограничено ролью" />}
        {(card.state === "no_plan" || card.state === "no_fx") && <AlertCircle className="size-4 text-warning" aria-hidden="true" />}
      </div>
      <div className="space-y-1">
        <p className={cn("text-2xl font-semibold tracking-tight tabular-nums", muted && "text-base font-medium text-muted-foreground")}>{card.value}</p>
        {card.hint && <p className="text-xs leading-snug text-muted-foreground">{card.hint}</p>}
      </div>
    </div>
  );
}
