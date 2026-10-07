import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeInternalHref } from "@/lib/portal/notification-types";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const TONE: Record<string, string> = {
  CRITICAL: "border-destructive/40 bg-destructive/5 text-destructive",
  WARNING: "border-warning/50 bg-warning/10 text-foreground",
  INFO: "border-border bg-card text-foreground",
};
const DOT: Record<string, string> = { CRITICAL: "bg-destructive", WARNING: "bg-warning", INFO: "bg-brand" };

/** «Требует внимания»: строки приходят из attention_summary() вместе со ссылками и важностью (RLS учитывает роль). */
export async function AttentionPanel() {
  let rows: { kind: string; label: string; cnt: number; href: string; severity: string }[] = [];
  let failed = false;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("attention_summary");
    if (error) failed = true;
    else rows = data ?? [];
  } catch {
    failed = true;
  }
  const rank = (s: string) => (s === "CRITICAL" ? 0 : s === "WARNING" ? 1 : 2);
  const sorted = [...rows].sort((a, b) => rank(a.severity) - rank(b.severity));

  return (
    <Card data-testid="attention-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-warning" aria-hidden="true" /> Требует внимания
        </CardTitle>
        <CardDescription>Что нужно проверить сейчас. Число считает база данных.</CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-muted-foreground">Не удалось загрузить сводку. Обновите страницу.</p>
        ) : sorted.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-success" aria-hidden="true" /> Срочных задач нет.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sorted.map((r) => {
              const href = safeInternalHref(r.href);
              const inner = (
                <>
                  <span className={cn("size-2 shrink-0 rounded-full", DOT[r.severity] ?? DOT.INFO)} aria-hidden="true" />
                  <span className="text-xl font-semibold tabular-nums">{r.cnt}</span>
                  <span className="min-w-0 flex-1 text-sm">{r.label}</span>
                  {href && <ArrowRight className="size-4 shrink-0 opacity-60" aria-hidden="true" />}
                </>
              );
              const cls = cn("flex min-h-12 items-center gap-3 rounded-lg border px-3 py-2", TONE[r.severity] ?? TONE.INFO);
              return (
                <li key={r.kind} data-testid={`attention-${r.kind}`}>
                  {href ? (
                    <Link href={href} className={cn(cls, "outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40")}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={cls}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
