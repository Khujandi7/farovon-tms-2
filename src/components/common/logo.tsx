import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-lg bg-brand text-[13px] font-bold tracking-tight text-white shadow-sm">
        F
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-sm font-semibold tracking-tight">FAROVON TMS</span>
          <span className="mt-0.5 text-[11px] text-muted-foreground">Академия Фаровон</span>
        </span>
      )}
    </span>
  );
}
