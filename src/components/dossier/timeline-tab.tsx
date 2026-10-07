import Link from "next/link";
import { ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TIMELINE_KIND_LABELS, timelineHref } from "@/lib/employees/tabs";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

/** Вкладка «Хронология»: мероприятия, экзамены, сертификаты, соглашения, навыки и выполненные цели по датам. */
export async function TimelineTab({ employeeId }: { employeeId: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("employee_timeline", { p_employee: employeeId });
  if (error) return <ErrorState className="bg-card" title="Не удалось загрузить хронологию" description="Попробуйте обновить страницу." />;
  return (
    <Card data-testid="timeline-tab">
      <CardHeader>
        <CardTitle>Хронология</CardTitle>
        <CardDescription>Всё, что происходило с сотрудником в обучении, от новых событий к старым.</CardDescription>
      </CardHeader>
      <CardContent>
        {!data?.length ? (
          <p className="text-sm text-muted-foreground">Событий пока нет.</p>
        ) : (
          <ol className="relative space-y-4 border-l pl-5">
            {data.map((r, i) => {
              const href = timelineHref(r.ref_table, r.ref_id, employeeId);
              return (
                <li key={`${r.ref_table}-${r.ref_id}-${i}`} className="relative" data-testid="timeline-item">
                  <span className="absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full bg-brand" aria-hidden />
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <time>{r.event_date ? formatDate(r.event_date) : "—"}</time>
                    <Badge variant="secondary">{TIMELINE_KIND_LABELS[r.kind] ?? r.kind}</Badge>
                    {r.status && <Badge variant="outline">{r.status}</Badge>}
                  </div>
                  <p className="text-sm font-medium">{href ? <Link href={href} className="hover:text-brand hover:underline">{r.title}</Link> : r.title}</p>
                  {r.detail && <p className="text-sm text-muted-foreground">{r.detail}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
