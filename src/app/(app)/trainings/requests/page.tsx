import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/common/states";
import { NewRequestDialog } from "@/components/trainings/new-request-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { formatMoney, formatNumber } from "@/lib/format";
import { REQUEST_STATUS_LABELS, REQUEST_STATUS_OPTIONS, REQUEST_STATUS_VARIANT } from "@/lib/labels";
import { createClient } from "@/lib/supabase/server";
import { availableYears } from "@/lib/years";
import { can } from "@/lib/workflows/roles";
import { REQUEST_STATUSES } from "@/lib/workflows/schemas";

export const metadata: Metadata = { title: "Заявки на обучение" };
export const dynamic = "force-dynamic";
const PAGE = 50;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "trainings")) return <ForbiddenState className="bg-card" />;
  const yearRaw = one(raw.year);
  const year = yearRaw && /^\d{4}$/.test(yearRaw) ? Number(yearRaw) : null;
  const statusRaw = one(raw.status);
  const status = (REQUEST_STATUSES as readonly string[]).includes(statusRaw ?? "") ? (statusRaw as (typeof REQUEST_STATUSES)[number]) : null;
  const q = (one(raw.q) ?? "").replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const archived = one(raw.archived) === "1";

  const supabase = await createClient();
  let req = supabase
    .from("training_requests")
    .select("id, canonical_id, plan_year, topic, requester_raw, participants_planned, budget_amount, budget_currency, status, archived_at, linked:trainings(id)")
    .order("plan_year", { ascending: false })
    .order("canonical_id", { ascending: false })
    .limit(PAGE);
  req = archived ? req.not("archived_at", "is", null) : req.is("archived_at", null);
  if (year) req = req.eq("plan_year", year);
  if (status) req = req.eq("status", status);
  if (q) req = req.or(`topic.ilike.%${q}%,canonical_id.ilike.%${q}%,requester_raw.ilike.%${q}%`);
  const { data, error } = await req;
  const canCreate = can(session.role, "request");

  return (
    <div className="space-y-5">
      <PageHeader breadcrumbs={[{ label: "Обучения", href: "/trainings" }, { label: "Заявки" }]} backHref="/trainings" backLabel="К списку обучений" title="Заявки на обучение" description="Плановые заявки. Тренинг с привязанной заявкой считается плановым." actions={canCreate ? <NewRequestDialog defaultYear={new Date().getUTCFullYear()} /> : undefined} />
      <form method="get" className="flex flex-wrap items-end gap-2" role="search" aria-label="Фильтры заявок">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Год
          <Select name="year" defaultValue={year ? String(year) : ""} className="min-w-28">
            <option value="">Все годы</option>
            {availableYears().map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Статус
          <Select name="status" defaultValue={status ?? ""} className="min-w-40">
            <option value="">Любой</option>
            {REQUEST_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Поиск
          <Input name="q" defaultValue={q} placeholder="Тема, код, инициатор" className="min-w-48" />
        </label>
        <label className="flex h-9 items-center gap-2 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={archived} className="size-4 accent-[var(--brand)]" /> Архив
        </label>
        <Button type="submit" variant="outline">Применить</Button>
        {(year || status || q || archived) && <Button asChild variant="ghost"><Link href="/trainings/requests">Сбросить</Link></Button>}
      </form>

      {error ? (
        <ErrorState className="bg-card" title="Не удалось загрузить заявки" description="Попробуйте обновить страницу." />
      ) : !data?.length ? (
        <EmptyState className="bg-card" icon={ShieldCheck} title={q || year || status ? "Ничего не найдено" : "Заявок пока нет"} description={canCreate ? "Создайте заявку кнопкой «Новая заявка»." : undefined} />
      ) : (
        <div className="rounded-xl border bg-card shadow-xs">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Код</TableHead>
                <TableHead>Год</TableHead>
                <TableHead>Тема</TableHead>
                <TableHead>Инициатор</TableHead>
                <TableHead className="text-right">Участников</TableHead>
                <TableHead className="text-right">Бюджет</TableHead>
                <TableHead>Тренинг</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id} data-testid="request-row">
                  <TableCell className="font-mono text-xs text-muted-foreground">{r.canonical_id}</TableCell>
                  <TableCell>{r.plan_year}</TableCell>
                  <TableCell className="max-w-80 min-w-48 font-medium whitespace-normal">
                    <Link href={`/trainings/requests/${r.id}`} className="hover:text-brand hover:underline">{r.topic}</Link>
                    {r.archived_at && <Badge variant="outline" className="ml-2">Архив</Badge>}
                  </TableCell>
                  <TableCell>{r.requester_raw ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.participants_planned)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.budget_amount === null ? "—" : formatMoney(Number(r.budget_amount), r.budget_currency ?? "")}</TableCell>
                  <TableCell>{(r.linked as { id: string }[] | null)?.length ? "Есть" : <span className="text-muted-foreground">Нет</span>}</TableCell>
                  <TableCell><Badge variant={REQUEST_STATUS_VARIANT[r.status]}>{REQUEST_STATUS_LABELS[r.status]}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
