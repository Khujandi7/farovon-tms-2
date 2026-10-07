import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEGAL_WARNING, LEGAL_WARNING_DETAIL } from "@/lib/funding/calc";

/** Предупреждение перед любым расчётом или созданием обязательства. */
export function LegalWarning({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div role="note" data-testid="legal-warning" className={cn("flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-sm", className)}>
      <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-medium">{LEGAL_WARNING}</p>
        {!compact && <p className="text-xs text-muted-foreground">{LEGAL_WARNING_DETAIL}</p>}
      </div>
    </div>
  );
}
