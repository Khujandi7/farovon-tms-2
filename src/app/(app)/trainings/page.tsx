import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ClipboardList, Plus, ShieldCheck } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateRange, formatMoney, formatNumber } from "@/lib/format";
import { SOURCE_TYPE_LABELS, TRAINING_FORMAT_LABELS, TRAINING_STATUS_LABELS, TRAINING_STATUS_OPTIONS, TRAINING_STATUS_VARIANT } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { availableYears } from "@/lib/years";
import { PAGE_SIZE, listQuery, parseListParams } from "@/lib/trainings/list-params";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Обучения" };
export const dynamic = "force-dynamic";

export default async function TrainingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = parseListParams(await searchParams);

  return (
    <SectionPage
      section="trainings"
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/trainings/requests">
              <ClipboardList /> Заявки
            </Link>
          </Button>
        </>
      }
    >
      {async (session) => {
        const supabase = await createClient();
        let req = supabase
          .from("v_training_list")
          .select("id, canonical_id, title, format, status, source_type, source_confirmed, hours, start_date, end_date, participants, man_hours, actual_tjs, archived_at", { count: "exact" })
          .order("start_date", { ascending: false })
          .order("canonical_id", { ascending: false })
          .range((params.page - 1) * PAGE_SIZE, params.page * PAGE_SIZE - 1);
        req = params.archived ? req.not("archived_at", "is", null) : req.is("archived_at", null);
        if (params.year) req = req.gte("start_date", `${params.year}-01-01`).lte("start_date", `${params.year}-12-31`);
        if (params.status) req = req.eq("status", params.status);
        if (params.source) req = req.eq("source_type", params.source);
        if (params.q) req = req.or(`title.ilike.%${params.q}%,canonical_id.ilike.%${params.q}%`);
        const { data, error, count } = await req;
        const canCreate = can(session.role, "training");
        const showMoney = session.role !== "HR";
        const total = count ?? 0;
        const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form method="get" className="flex flex-wrap items-end gap-2" role="search" aria-label="Фильтры обучений">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Год
                  <Select name="year" defaultValue={params.year ? String(params.year) : ""} className="min-w-28">
                    <option value="">Все годы</option>
                    {availableYears().map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Статус
                  <Select name="status" defaultValue={params.status ?? ""} className="min-w-40">
                    <option value="">Любой</option>
                    {TRAINING_STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Источник
                  <Select name="source" defaultValue={params.source ?? ""} className="min-w-36">
                    <option value="">Любой</option>
                    <option value="PLANNED">Плановое</option>
                    <option value="UNPLANNED">Внеплановое</option>
                  </Select>
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Поиск
                  <Input name="q" defaultValue={params.q} placeholder="Название или код" className="min-w-44" />
                </label>
                <label className="flex h-9 items-center gap-2 text-sm">
                  <input type="checkbox" name="archived" value="1" defaultChecked={params.archived} className="size-4 accent-[var(--brand)]" /> Архив
                </label>
                <Button type="submit" variant="outline">Применить</Button>
                {(params.year || params.status || params.source || params.q || params.archived) && (
                  <Button asChild variant="ghost"><Link href="/trainings">Сбросить</Link></Button>
                )}
              </form>
              {canCreate && (
                <Button asChild>
                  <Link href="/trainings/new" data-testid="new-training">
                    <Plus /> Новый тренинг
                  </Link>
                </Button>
              )}
            </div>

            {error ? (
              <ErrorState className="bg-card" title="Не удалось загрузить обучения" description="Попробуйте обновить страницу." />
            ) : !data?.length ? (
              <EmptyState
                className="bg-card"
                icon={ShieldCheck}
                title={params.q || params.year || params.status || params.source ? "Ничего не найдено" : params.archived ? "Архив пуст" : "Обучений пока нет"}
                description={canCreate ? "Создайте первый тренинг кнопкой «Новый тренинг» или измените фильтры." : "Измените фильтры или дождитесь появления записей."}
              />
            ) : (
              <div className="rounded-xl border bg-card shadow-xs">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Код</TableHead>
                      <TableHead>Название</TableHead>
                      <TableHead>Даты</TableHead>
                      <TableHead className="text-right">Часы</TableHead>
                      <TableHead className="text-right">Участники</TableHead>
                      <TableHead className="text-right">Чел.-часы</TableHead>
                      {showMoney && <TableHead className="text-right">Факт, TJS</TableHead>}
                      <TableHead>Формат</TableHead>
                      <TableHead>Источник</TableHead>
                      <TableHead>Статус</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((t) => (
                      <TableRow key={t.id} data-testid="training-row">
                        <TableCell className="font-mono text-xs text-muted-foreground">{t.canonical_id}</TableCell>
                        <TableCell className="max-w-80 min-w-48 font-medium whitespace-normal">
                          <Link href={`/trainings/${t.id}`} className="hover:text-brand hover:underline">{t.title}</Link>
                          {t.archived_at && <Badge variant="outline" className="ml-2">Архив</Badge>}
                        </TableCell>
                        <TableCell>{formatDateRange(t.start_date, t.end_date)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(t.hours)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(t.participants)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(t.man_hours)}</TableCell>
                        {showMoney && <TableCell className="text-right tabular-nums">{formatMoney(t.actual_tjs, "")}</TableCell>}
                        <TableCell>{t.format ? TRAINING_FORMAT_LABELS[t.format] : "—"}</TableCell>
                        <TableCell>
                          {t.source_type ? SOURCE_TYPE_LABELS[t.source_type] : "—"}
                          {t.source_type === "UNPLANNED" && !t.source_confirmed && <span className="ml-1 text-xs text-warning">· не подтверждено</span>}
                        </TableCell>
                        <TableCell>
                          {t.status && <Badge variant={TRAINING_STATUS_VARIANT[t.status]}>{TRAINING_STATUS_LABELS[t.status]}</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {total > PAGE_SIZE && (
              <nav aria-label="Страницы" className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Всего: {total}. Страница {params.page} из {pages}
                </span>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" aria-disabled={params.page <= 1} className={params.page <= 1 ? "pointer-events-none opacity-50" : undefined}>
                    <Link href={`/trainings${listQuery(params, { page: params.page - 1 })}`} aria-label="Предыдущая страница"><ChevronLeft /> Назад</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm" aria-disabled={params.page >= pages} className={params.page >= pages ? "pointer-events-none opacity-50" : undefined}>
                    <Link href={`/trainings${listQuery(params, { page: params.page + 1 })}`} aria-label="Следующая страница">Вперёд <ChevronRight /></Link>
                  </Button>
                </div>
              </nav>
            )}
          </div>
        );
      }}
    </SectionPage>
  );
}
