import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/common/states";
import { formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { SourceSyncButton, SourceToggle } from "./source-sync-button";

const STATUS: Record<string, { label: string; tone: "default" | "success" | "warning" | "outline" }> = {
  NEVER: { label: "Ещё не синхронизирован", tone: "outline" },
  STAGED: { label: "Проанализирован, не применён", tone: "outline" },
  NEEDS_REVIEW: { label: "Нужна проверка", tone: "warning" },
  SUCCESS: { label: "Синхронизирован", tone: "success" },
  FAILED: { label: "Ошибка", tone: "warning" },
};
const dt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dushanbe" });

/** Сохранённые источники Google Sheets справочника сотрудников: итог последней синхронизации и «Синхронизировать сейчас». */
export async function GoogleSourcesPanel({ canSync }: { canSync: boolean }) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("import_sources")
    .select("id, name, spreadsheet_url, sheet_name, is_active, last_sync_at, last_status, last_stats, last_error, last_job_id")
    .eq("entity", "EMPLOYEES")
    .order("created_at", { ascending: true });
  return (
    <section className="space-y-3" aria-labelledby="sources-title" data-testid="gsheet-sources">
      <div>
        <h2 id="sources-title" className="font-medium">Источники Google Sheets</h2>
        <p className="text-sm text-muted-foreground">Повторная синхронизация обновляет существующих сотрудников и не создаёт дубликатов. Сотрудники, исчезнувшие из таблицы, не удаляются — появляется замечание в «Качестве данных».</p>
      </div>
      {error ? (
        <ErrorState className="bg-card" compact title="Не удалось загрузить источники" />
      ) : !data?.length ? (
        <EmptyState className="bg-card" compact title="Источников пока нет" description="Выберите «Google Sheets» в мастере выше и отметьте «Сохранить как источник»." />
      ) : (
        <ul className="grid gap-3">
          {data.map((s) => {
            const st = STATUS[s.last_status] ?? STATUS.NEVER!;
            const n = (s.last_stats ?? {}) as Record<string, number>;
            return (
              <li key={s.id} className="space-y-3 rounded-xl border bg-card p-4 shadow-xs" data-testid="gsheet-source">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{s.name}{!s.is_active && <Badge variant="outline" className="ml-2">Отключён</Badge>}</p>
                    <p className="text-xs text-muted-foreground">
                      Лист «{s.sheet_name}» ·{" "}
                      <a href={s.spreadsheet_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-brand hover:underline">открыть таблицу <ExternalLink className="size-3" aria-hidden="true" /></a>
                    </p>
                  </div>
                  <Badge variant={st.tone} data-testid="gsheet-source-status">{st.label}</Badge>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4" data-testid="gsheet-source-stats">
                  <Stat k="Последняя синхронизация" v={s.last_sync_at ? dt.format(new Date(s.last_sync_at)) : "—"} wide />
                  <Stat k="Прочитано строк" v={formatNumber(n.rows_read ?? null)} />
                  <Stat k="Создано" v={formatNumber(n.created ?? null)} />
                  <Stat k="Обновлено" v={formatNumber(n.updated ?? null)} />
                  <Stat k="Без изменений" v={formatNumber(n.unchanged ?? null)} />
                  <Stat k="Замечаний" v={formatNumber(n.issues ?? null)} />
                  <Stat k="Нет в таблице" v={formatNumber(n.missing ?? null)} />
                </dl>
                {s.last_status === "FAILED" && s.last_error && <p className="text-sm text-destructive" data-testid="gsheet-source-error">{s.last_error}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {canSync && s.is_active && <SourceSyncButton id={s.id} />}
                  {s.last_job_id && <Link href={`/imports/${s.last_job_id}`} className="text-sm text-muted-foreground hover:text-brand hover:underline">Последний импорт →</Link>}
                  {canSync && <SourceToggle id={s.id} active={s.is_active} />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
