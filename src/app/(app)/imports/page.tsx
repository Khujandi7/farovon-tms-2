import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileUp, History } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { ENTITY_DEFS, ENTITY_LABELS, IMPORT_ENTITIES, JOB_STATUS_LABELS, SOURCE_LABELS, canImportEntity } from "@/lib/imports/entities";

export const metadata: Metadata = { title: "Импорт" };
export const dynamic = "force-dynamic";

const dt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Dushanbe" });
const statusVariant = (s: string) => (s === "COMMITTED" ? "success" : s === "STAGED" || s === "COMMITTING" ? "warning" : "outline") as "success" | "warning" | "outline";

export default async function ImportsPage() {
  return (
    <SectionPage section="imports">
      {async (session) => {
        const supabase = await createClient();
        const cols = "id, entity, source, file_name, status, total_rows, new_rows, updated_rows, unchanged_rows, duplicate_rows, review_rows, error_rows, inserted, updated, skipped, created_at, created_by";
        const { data: jobs, error } = await supabase.from("import_jobs").select(cols).order("created_at", { ascending: false }).limit(50);
        const ids = [...new Set((jobs ?? []).map((j) => j.created_by).filter((x): x is string => !!x))];
        const names = new Map<string, string>();
        if (ids.length) {
          const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", ids);
          for (const p of ps ?? []) names.set(p.id, p.full_name ?? "—");
        }
        const allowed = IMPORT_ENTITIES.filter((e) => canImportEntity(session.role, e));
        return (
          <div className="space-y-8">
            <section aria-labelledby="imp-tiles" className="space-y-3">
              <h2 id="imp-tiles" className="text-sm font-medium text-muted-foreground">Что загружаем</h2>
              {allowed.length === 0 ? (
                <EmptyState className="bg-card" title="Нет доступных импортов" description="Ваша роль не предусматривает загрузку данных." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {allowed.map((e) => (
                    <div key={e} className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs" data-testid={`import-tile-${ENTITY_DEFS[e].slug}`}>
                      <div className="space-y-1">
                        <h3 className="font-medium">{ENTITY_LABELS[e]}</h3>
                        <p className="text-sm text-muted-foreground">{ENTITY_DEFS[e].description}</p>
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-2">
                        <Button asChild size="sm"><Link href={`/imports/new?entity=${e}`} data-testid={`import-upload-${ENTITY_DEFS[e].slug}`}><FileUp aria-hidden="true" /> Загрузить</Link></Button>
                        <Button asChild size="sm" variant="outline"><a href={`/imports/templates/${ENTITY_DEFS[e].slug}`} download><Download aria-hidden="true" /> Шаблон .xlsx</a></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">Импорт Google Sheets по ссылке появится позже: пока вставьте таблицу из буфера или загрузите .xlsx / .csv.</p>
            </section>

            <section aria-labelledby="imp-history" className="space-y-3">
              <h2 id="imp-history" className="text-sm font-medium text-muted-foreground">История импортов</h2>
              {error ? (
                <ErrorState className="bg-card" title="Не удалось загрузить историю" description="Попробуйте обновить страницу." />
              ) : !jobs?.length ? (
                <EmptyState className="bg-card" icon={History} title="Импортов пока не было" description="Загрузите первый файл — результат появится здесь." />
              ) : (
                <div className="rounded-xl border bg-card shadow-xs">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Дата</TableHead>
                        <TableHead>Автор</TableHead>
                        <TableHead>Сущность</TableHead>
                        <TableHead>Файл</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Счётчики</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((j) => (
                        <TableRow key={j.id} data-testid="import-job-row">
                          <TableCell className="whitespace-nowrap tabular-nums">{dt.format(new Date(j.created_at))}</TableCell>
                          <TableCell>{(j.created_by && names.get(j.created_by)) || "—"}</TableCell>
                          <TableCell>{ENTITY_LABELS[j.entity as keyof typeof ENTITY_LABELS] ?? j.entity}</TableCell>
                          <TableCell className="max-w-64">
                            <Link href={`/imports/${j.id}`} className="block truncate font-medium hover:text-brand hover:underline" title={j.file_name}>{j.file_name}</Link>
                            <span className="text-xs text-muted-foreground">{SOURCE_LABELS[j.source] ?? j.source}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(j.status)}>{JOB_STATUS_LABELS[j.status] ?? j.status}</Badge>
                            {j.status === "STAGED" && j.review_rows > 0 && <span className="ml-2 text-xs text-warning">требуют решения: {j.review_rows}</span>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            Всего {j.total_rows}
                            {j.status === "COMMITTED" ? `; добавлено ${j.inserted}, обновлено ${j.updated}, пропущено ${j.skipped}` : `; новых ${j.new_rows}, обновл. ${j.updated_rows}, без изм. ${j.unchanged_rows}, дублей ${j.duplicate_rows}, ошибок ${j.error_rows}`}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </div>
        );
      }}
    </SectionPage>
  );
}
