import type { Metadata } from "next";
import Link from "next/link";
import { Award, ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/common/states";
import { CertificateActions } from "@/components/certificates/certificate-actions";
import { CertificateDialog } from "@/components/certificates/certificate-dialog";
import { CertificateStatus } from "@/components/certificates/certificate-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";
import { CERTS_PAGE_SIZE, certListQuery, parseCertListParams } from "@/lib/certificates/list-params";
import { CERT_STATUSES, CERT_STATUS_LABELS, EXPIRING_DAYS, certTypeLabel } from "@/lib/certificates/status";
import { loadProviderOptions, loadSkillOptions } from "@/lib/exams/options";

export const metadata: Metadata = { title: "Сертификаты" };
export const dynamic = "force-dynamic";

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = parseCertListParams(await searchParams);
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "exams")) return <ForbiddenState className="bg-card" />;
  const canEdit = can(session.role, "certificate");
  const supabase = await createClient();
  const [skills, providers] = await Promise.all([loadSkillOptions(supabase), loadProviderOptions(supabase)]);

  // Поиск по сотруднику: сначала подбираем id по ФИО (v_certificates — представление без связей).
  let employeeIds: string[] | null = null;
  if (p.q) {
    const { data: emp } = await supabase.from("employees").select("id").ilike("full_name", `%${p.q}%`).limit(300);
    employeeIds = (emp ?? []).map((x) => x.id);
  }

  let rows: {
    id: string; employee_id: string; name: string; cert_type: string; issuing_organization: string | null; provider_id: string | null;
    issue_date: string | null; expiration_date: string | null; certificate_number: string | null; skill_id: number | null; notes: string | null;
    status: string | null; days_left: number | null;
  }[] = [];
  let total = 0;
  let failed = false;
  if (!employeeIds || employeeIds.length) {
    let req = supabase.from("v_certificates").select("*", { count: "exact" }).is("archived_at", null).order("expiration_date", { ascending: true, nullsFirst: false }).order("name").range((p.page - 1) * CERTS_PAGE_SIZE, p.page * CERTS_PAGE_SIZE - 1);
    if (p.status) req = req.eq("status", p.status);
    if (p.expiring) req = req.eq("status", "ACTIVE").gte("days_left", 0).lte("days_left", EXPIRING_DAYS);
    if (p.provider) req = req.eq("provider_id", p.provider);
    if (employeeIds) req = req.in("employee_id", employeeIds);
    const { data, error, count } = await req;
    failed = !!error;
    total = count ?? 0;
    rows = (data ?? []).map((r) => ({
      id: r.id ?? "", employee_id: r.employee_id ?? "", name: r.name ?? "", cert_type: r.cert_type ?? "TRAINING", issuing_organization: r.issuing_organization,
      provider_id: r.provider_id, issue_date: r.issue_date, expiration_date: r.expiration_date, certificate_number: r.certificate_number,
      skill_id: r.skill_id, notes: r.notes, status: r.status, days_left: r.days_left,
    }));
  }
  const empIds = [...new Set(rows.map((r) => r.employee_id))];
  const { data: emps } = empIds.length ? await supabase.from("employees").select("id, full_name").in("id", empIds) : { data: [] };
  const empName = new Map((emps ?? []).map((x) => [x.id, x.full_name]));
  const provName = new Map(providers.map((x) => [x.id, x.name]));
  const pages = Math.max(1, Math.ceil(total / CERTS_PAGE_SIZE));
  const filtered = !!(p.status || p.expiring || p.q || p.provider);

  return (
    <div className="space-y-6">
      <PageHeader title="Сертификаты" description="Реестр сертификатов сотрудников: статусы, сроки действия, отзыв" breadcrumbs={[{ label: "Экзамены", href: "/exams" }, { label: "Сертификаты" }]} actions={canEdit ? <CertificateDialog skills={skills} providers={providers} size="default" /> : undefined} />
      <form method="get" className="grid gap-2 sm:flex sm:flex-wrap sm:items-end" role="search" aria-label="Фильтры сертификатов">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Сотрудник
          <Input name="q" defaultValue={p.q} placeholder="Поиск по ФИО" className="h-10 sm:min-w-48" />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Статус
          <Select name="status" defaultValue={p.status ?? ""} className="h-10 sm:min-w-40">
            <option value="">Все</option>
            {CERT_STATUSES.map((s) => (
              <option key={s} value={s}>{CERT_STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Провайдер
          <Select name="provider" defaultValue={p.provider ?? ""} className="h-10 sm:min-w-44">
            <option value="">Все</option>
            {providers.map((pr) => (
              <option key={pr.id} value={pr.id}>{pr.name}</option>
            ))}
          </Select>
        </label>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" name="expiring" value="1" defaultChecked={p.expiring} className="size-4 accent-[var(--brand)]" /> Истекают в течение {EXPIRING_DAYS} дней
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="outline" className="h-10">Применить</Button>
          {filtered && <Button asChild variant="ghost" className="h-10"><Link href="/certificates">Сбросить</Link></Button>}
        </div>
      </form>

      {failed ? (
        <ErrorState className="bg-card" title="Не удалось загрузить сертификаты" description="Попробуйте обновить страницу." />
      ) : !rows.length ? (
        <EmptyState className="bg-card" icon={Award} title={filtered ? "Ничего не найдено" : "Сертификатов пока нет"} description={filtered ? "Измените фильтры." : "Добавьте первый сертификат кнопкой «Новый сертификат»."} />
      ) : (
        <>
          <div className="hidden rounded-xl border bg-card shadow-xs md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Сотрудник</TableHead>
                  <TableHead>Сертификат</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Провайдер</TableHead>
                  <TableHead>Выдан</TableHead>
                  <TableHead>Действует до</TableHead>
                  <TableHead>Статус</TableHead>
                  {canEdit && <TableHead><span className="sr-only">Действия</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} data-testid="certificate-row">
                    <TableCell className="font-medium"><Link href={`/employees/${r.employee_id}`} className="hover:text-brand hover:underline">{empName.get(r.employee_id) ?? "—"}</Link></TableCell>
                    <TableCell className="max-w-64 whitespace-normal">{r.name}{r.certificate_number && <span className="block text-xs text-muted-foreground">№ {r.certificate_number}</span>}</TableCell>
                    <TableCell>{certTypeLabel(r.cert_type)}</TableCell>
                    <TableCell>{(r.provider_id && provName.get(r.provider_id)) || r.issuing_organization || "—"}</TableCell>
                    <TableCell>{formatDate(r.issue_date)}</TableCell>
                    <TableCell>{r.expiration_date ? formatDate(r.expiration_date) : "бессрочно"}</TableCell>
                    <TableCell><CertificateStatus status={r.status} daysLeft={r.days_left} /></TableCell>
                    {canEdit && <TableCell><CertificateActions cert={r} revoked={r.status === "REVOKED"} skills={skills} providers={providers} /></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="grid gap-3 md:hidden" aria-label="Сертификаты">
            {rows.map((r) => (
              <li key={r.id} className="space-y-2 rounded-xl border bg-card p-3 text-sm shadow-xs" data-testid="certificate-card">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <Link href={`/employees/${r.employee_id}`} className="text-muted-foreground hover:text-brand">{empName.get(r.employee_id) ?? "—"}</Link>
                </div>
                <CertificateStatus status={r.status} daysLeft={r.days_left} />
                <p className="text-xs text-muted-foreground">{certTypeLabel(r.cert_type)} · {r.expiration_date ? `до ${formatDate(r.expiration_date)}` : "бессрочно"}</p>
                {canEdit && <CertificateActions cert={r} revoked={r.status === "REVOKED"} skills={skills} providers={providers} />}
              </li>
            ))}
          </ul>
        </>
      )}
      {total > CERTS_PAGE_SIZE && (
        <nav aria-label="Страницы" className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Всего: {total}. Страница {p.page} из {pages}</span>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className={p.page <= 1 ? "pointer-events-none opacity-50" : undefined}><Link href={`/certificates${certListQuery(p, p.page - 1)}`}><ChevronLeft /> Назад</Link></Button>
            <Button asChild variant="outline" size="sm" className={p.page >= pages ? "pointer-events-none opacity-50" : undefined}><Link href={`/certificates${certListQuery(p, p.page + 1)}`}>Вперёд <ChevronRight /></Link></Button>
          </div>
        </nav>
      )}
    </div>
  );
}
