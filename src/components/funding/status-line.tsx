import { Check, Circle, CircleDot, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { agreementSteps, type StepState } from "@/lib/funding/status";

const ICON: Record<StepState, typeof Check> = { done: Check, current: CircleDot, todo: Circle, skipped: Minus };

/** Статус-линия соглашения: соглашение -> расчёт -> проверка -> погашение. */
export function StatusLine({ agreement }: { agreement: { status: string; evaluated_at: string | null; reviewed_at: string | null; repayment_amount: number } }) {
  const steps = agreementSteps(agreement);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-2" aria-label="Этапы соглашения" data-testid="status-line">
      {steps.map((s, i) => {
        const Icon = ICON[s.state];
        return (
          <li key={s.key} aria-current={s.state === "current" ? "step" : undefined} className="flex items-center gap-2 text-sm">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1",
                s.state === "done" && "border-success/40 bg-success/10 text-success",
                s.state === "current" && "border-brand/40 bg-brand-soft text-brand font-medium",
                s.state === "todo" && "text-muted-foreground",
                s.state === "skipped" && "text-muted-foreground line-through opacity-70",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" /> {s.label}
            </span>
            {i < steps.length - 1 && <span className="text-muted-foreground" aria-hidden="true">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
