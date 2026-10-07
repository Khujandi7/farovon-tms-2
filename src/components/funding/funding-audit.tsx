import { ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/common/states";
import { describeFundingAudit, type FundingAuditRow } from "@/lib/funding/audit";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Журнал изменений соглашения: кто, когда, что, было -> стало, причина. */
export function FundingAudit({ rows }: { rows: FundingAuditRow[] }) {
  if (rows.length === 0) return <EmptyState className="bg-card" compact title="Изменений пока нет" />;
  return (
    <ol className="space-y-3" data-testid="funding-audit">
      {rows.map((row) => {
        const v = describeFundingAudit(row);
        return (
          <li key={row.id} className="rounded-lg border bg-card p-3 text-sm shadow-xs" data-testid="audit-row">
            <p className="font-medium">{v.title}</p>
            <p className="text-xs text-muted-foreground">
              {row.user_name ?? "Система"} · {formatWhen(row.at)}
            </p>
            {v.lines.length > 0 && (
              <ul className="mt-2 space-y-1">
                {v.lines.map((l) => (
                  <li key={l.field} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="text-muted-foreground">{l.label}:</span>
                    <span className="line-through opacity-70">{l.before}</span>
                    <ArrowRight className="size-3 self-center text-muted-foreground" aria-hidden="true" />
                    <span className="font-medium">{l.after}</span>
                  </li>
                ))}
              </ul>
            )}
            {row.reason && <p className="mt-2 text-xs text-muted-foreground">Причина: {row.reason}</p>}
          </li>
        );
      })}
    </ol>
  );
}
