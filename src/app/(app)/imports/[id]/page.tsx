import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { ImportJobActions } from "@/components/imports/import-job-actions";
import { ImportRowCard } from "@/components/imports/import-row-card";
import { ImportStepper } from "@/components/imports/import-stepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSectionAccess } from "@/lib/auth/session";
import { can } from "@/lib/workflows/roles";
import { createClient } from "@/lib/supabase/server";
import { ENTITY_LABELS, JOB_STATUS_LABELS, ROW_STATUS_LABELS, SOURCE_LABELS, canImportEntity, isImportEntity } from "@/lib/imports/entities";
import type { JobRowView } from "@/lib/imports/types";
import { uuid } from "@/lib/workflows/schemas";

export const metadata: Metadata = { title: "Импорт" };
export const dynamic = "force-dynamic";
const PAGE = 100;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STATUSES = ["NEW", "UPDATED", "UNCHANGED", "DUPLICATE", "NEEDS_REVIEW", "ERROR"] as const;
const dt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Dushanbe" });

export default async function ImportJobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const raw = await searchParams;
  if (!uuid.safeParse(id).success) notFound();
  const statusRaw = one(raw.status);
  const status = (STATUSES as readonly string[]).includes(statusRaw ?? "") ? (statusRaw as string) : "";
  const page = Math.min(Math.max(Number(one(raw.page)) || 1, 1), 1000);
  const crumbs = [{ label: "Импорт", href: "/imports" }, { label: "Результат" }];

  const access = await getSectionAccess("imports");
  if (!access.allowed) return <div className="space-y-6"><PageHeader title="Импорт" breadcrumbs={crumbs} /><ForbiddenState className="bg-card" /></div>;

  const supabase = await createClient();
  const { data: job, error } = await supabase.from("import_jobs").select("*").eq("id", id).maybeSingle();
  if (error) return <div className="space-y-6"><PageHeader title="Импорт" breadcrumbs={crumbs} /><ErrorState className="bg-card" title="Не удалось загрузить импорт" description="Попробуйте обновить страницу." /></div>;
  if (!job || !isImportEntity(job.entity)) notFound();
  const entity = job.entity;
  const canWork = canImportEntity(access.session.role, entity);

  let rq = supabase
    .from("import_job_rows")
    .select("id, row_no, status, messages, review_code, data, raw, candidates, decision, decision_match, match_id", { count: "exact" })
    .eq("job_id", id)
    .order("row_no")
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (status) rq = rq.eq("status", status);
  const [{ data: rows, count }, unresolvedQ, dqQ, authorQ, applyErrQ] = await Promise.all([
    rq,
    supabase.from("import_job_rows").select("id", { count: "exact", head: true }).eq("job_id", id).eq("status", "NEEDS_REVIEW").is("decision", null),
    supabase.from("dq_issues").select("id, message, rule_code, status").eq("entity_table", "import_jobs").eq("entity_id", id).in("status", ["OPEN", "IN_REVIEW"]).order("created_at").limit(20),
    job.created_by ? supabase.from("profiles").select("full_name").eq("id", job.created_by).maybeSingle() : Promise.resolve({ data: null }),
    // строки, не применённые из-за ошибки при пакетном применении
    supabase.from("import_job_rows").select("row_no, apply_error").eq("job_id", id).eq("apply_action", "ERROR").order("row_no").limit(20),
  ]);
  const applyErrors = applyErrQ.data ?? [];
  const unresolved = unresolvedQ.count ?? 0;
  const dq = dqQ.data ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const qs = (p: number, s = status) => {
    const sp = new URLSearchParams();
    if (s) sp.set("status", s);
    if (p > 1) sp.set("page", String(p));
    const t = sp.toString();
    return t ? `?${t}` : "";
  };
  const staged = job.status === "STAGED";
  const committing = job.status === "COMMITTING";
  const processedRows = job.inserted + job.updated + job.skipped + job.apply_errors;
  const counts: Record<string, number> = { NEW: job.new_rows, UPDATED: job.updated_rows, UNCHANGED: job.unchanged_rows, DUPLICATE: job.duplicate_rows, NEEDS_REVIEW: job.review_rows, ERROR: job.error_rows };
  const views: JobRowView[] = (rows ?? []).map((r) => ({
    id: r.id, row_no: r.row_no, status: r.status, messages: r.messages ?? [], review_code: r.review_code,
    data: (r.raw && typeof r.raw === "object" && !Array.isArray(r.raw) ? r.raw : {}) as Record<string, unknown>,
    candidates: Array.isArray(r.candidates) ? (r.candidates as unknown as JobRowView["candidates"]) : [],
    decision: r.decision, decision_match: r.decision_match, match_id: r.match_id,
    dept_id: r.data && typeof r.data === "object" && !Array.isArray(r.data) && (r.data as Record<string, unknown>).department_id ? Number((r.data as Record<string, unknown>).department_id) : null,
  }));
  // справочник подразделений нужен только если на странице есть строки «Подразделение не найдено»
  const needUnits = staged && views.some((v) => v.status === "NEEDS_REVIEW" && v.review_code === "UNIT_UNKNOWN");
  const unitsQ = needUnits ? await supabase.from("org_units").select("id, name, parent_id, level").eq("is_active", true).order("name") : null;
  const unitOptions = (unitsQ?.data ?? []) as { id: number; name: string; parent_id: number | null; level: "DEPARTMENT" | "UNIT" }[];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Импорт: ${ENTITY_LABELS[entity]}`}
        description={`${job.file_name} · ${SOURCE_LABELS[job.source] ?? job.source} · ${dt.format(new Date(job.created_at))}${authorQ.data?.full_name ? ` · ${authorQ.data.full_name}` : ""}`}
        breadcrumbs={crumbs}
        backHref="/imports"
        backLabel="К центру импорта"
        actions={<Badge variant={job.status === "COMMITTED" ? "success" : staged || committing ? "warning" : "outline"} data-testid="import-job-status">{JOB_STATUS_LABELS[job.status] ?? job.status}</Badge>}
      />
      <ImportStepper current={staged ? "dry" : "commit"} />

      <section aria-label="Итоги по статусам" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6" data-testid="import-counts">
        {STATUSES.map((s) => (
          <Link key={s} href={`/imports/${id}${qs(1, status === s ? "" : s)}`} aria-current={status === s ? "true" : undefined} className={`rounded-xl border bg-card p-3 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ${status === s ? "border-brand ring-1 ring-brand" : ""}`} data-testid={`import-count-${s}`}>
            <div className="text-2xl font-semibold tabular-nums">{counts[s]}</div>
            <div className="text-xs text-muted-foreground">{ROW_STATUS_LABELS[s]}</div>
          </Link>
        ))}
      </section>
      {job.status === "COMMITTED" && (
        <p className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm" data-testid="import-result">
          Применено {job.committed_at ? dt.format(new Date(job.committed_at)) : ""}: добавлено {job.inserted}, обновлено {job.updated}, пропущено {job.skipped}, без решения {job.conflicts}{job.apply_errors ? `, с ошибкой ${job.apply_errors}` : ""}.
        </p>
      )}
      {applyErrors.length > 0 && (
        <section aria-labelledby="imp-apply-err" className="space-y-2 rounded-xl border border-destructive/40 bg-card p-4" data-testid="import-apply-errors">
          <h2 id="imp-apply-err" className="text-sm font-medium">Строки, не применённые из-за ошибки: {job.apply_errors}</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {applyErrors.map((e) => (<li key={e.row_no}>Строка {e.row_no}: {e.apply_error}</li>))}
            {job.apply_errors > applyErrors.length && <li>…и ещё {job.apply_errors - applyErrors.length}</li>}
          </ul>
        </section>
      )}

      {dq.length > 0 && (
        <section aria-labelledby="imp-dq" className="space-y-2 rounded-xl border border-warning/40 bg-card p-4" data-testid="import-dq">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="imp-dq" className="flex items-center gap-2 text-sm font-medium"><ShieldAlert className="size-4 text-warning" aria-hidden="true" /> Замечания качества данных по этому импорту: {dq.length}</h2>
            <Button asChild size="sm" variant="outline"><Link href="/data-quality">Открыть «Качество данных»</Link></Button>
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {dq.slice(0, 5).map((d) => (<li key={d.id}>{d.message}</li>))}
            {dq.length > 5 && <li>…и ещё {dq.length - 5}</li>}
          </ul>
        </section>
      )}

      {(staged || committing) && canWork && (
        <ImportJobActions key={job.status} jobId={id} unresolved={unresolved} totalApply={job.new_rows + job.updated_rows} status={job.status} processed={processedRows} total={job.total_rows} />
      )}
      {(staged || committing) && !canWork && <p className="text-sm text-muted-foreground">Ваша роль не может применять этот импорт.</p>}
      {job.status === "STAGING" && (
        <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground" data-testid="import-staging-note">Загрузка строк не завершена. Данные справочников не изменены — запустите импорт файла ещё раз.</p>
      )}

      <section aria-labelledby="imp-rows" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="imp-rows" className="text-sm font-medium text-muted-foreground">Строки{status ? `: ${ROW_STATUS_LABELS[status]}` : ""} ({total})</h2>
          {status && <Button asChild variant="ghost" size="sm"><Link href={`/imports/${id}`}>Показать все</Link></Button>}
        </div>
        {views.length === 0 ? (
          <p className="rounded-xl border border-dashed bg-card px-4 py-8 text-center text-sm text-muted-foreground">Нет строк с таким статусом.</p>
        ) : (
          <ul className="space-y-2" data-testid="import-rows">
            {views.map((r) => (<ImportRowCard key={r.id} jobId={id} entity={entity} row={r} canDecide={staged && canWork} units={unitOptions} canEditUnits={can(access.session.role, "orgUnits")} />))}
          </ul>
        )}
        {total > PAGE && (
          <nav aria-label="Страницы" className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Страница {page} из {pages}</span>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-50" : undefined}><Link href={`/imports/${id}${qs(page - 1)}`}><ChevronLeft /> Назад</Link></Button>
              <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-50" : undefined}><Link href={`/imports/${id}${qs(page + 1)}`}>Вперёд <ChevronRight /></Link></Button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
