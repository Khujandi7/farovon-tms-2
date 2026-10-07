import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { AuditTimeline } from "@/components/trainings/audit-timeline";
import { CertificateStatus } from "@/components/certificates/certificate-status";
import { CancelExamButton } from "@/components/exams/cancel-exam-button";
import { ExamCostDialog } from "@/components/exams/exam-cost-dialog";
import { ExamResultDialog } from "@/components/exams/exam-result-dialog";
import { NewExamDialog } from "@/components/exams/new-exam-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { buildAuditLookup } from "@/lib/audit/lookup";
import type { AuditRow } from "@/lib/audit/describe";
import { formatDate, formatMoney } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";
import { FUNDING_SOURCE_LABELS, examResultLabel, examResultTone, examStatusLabel, formatAttempt, formatScore } from "@/lib/exams/format";
import { loadProviderOptions, loadSkillOptions } from "@/lib/exams/options";

export const metadata: Metadata = { title: "Экзамен" };
export const dynamic = "force-dynamic";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[11rem_1fr] sm:gap-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

export default async function ExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "exams")) return <ForbiddenState className="bg-card" />;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: e } = await supabase
    .from("exams")
    .select("*, employee:employees(id, full_name, canonical_id), skill:skills(id, name, kind), provider:learning_providers(id, name), training:trainings(id, title)")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();

  const canEdit = can(session.role, "exam");
  const showCost = can(session.role, "examCost");
  const [attempts, certs, cost, audit, skills, providers] = await Promise.all([
    supabase.from("exams").select("id, canonical_id, attempt_no, exam_date, result, score, status").eq("employee_id", e.employee_id).eq("skill_id", e.skill_id).is("archived_at", null).order("attempt_no"),
    supabase.from("v_certificates").select("id, name, status, days_left, expiration_date, issue_date").eq("exam_id", id).is("archived_at", null),
    showCost ? supabase.from("exam_costs").select("fee, currency, fee_date, fee_tjs, fx_rate, funding_source, note").eq("exam_id", id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("entity_audit", { p_table: "exams", p_id: id, p_limit: 100 }),
    loadSkillOptions(supabase),
    loadProviderOptions(supabase),
  ]);
  const auditRows = (audit.data ?? []) as unknown as AuditRow[];
  const lookup = await buildAuditLookup(supabase, auditRows);
  const cancelled = e.status === "CANCELLED";
  const c = cost.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title={`${e.skill?.name ?? "Экзамен"} · ${formatAttempt(e.attempt_no)}`}
        description={`${e.canonical_id} · ${e.employee?.full_name ?? ""}`}
        backHref="/exams"
        backLabel="К списку экзаменов"
        breadcrumbs={[{ label: "Экзамены", href: "/exams" }, { label: e.canonical_id }]}
        actions={
          <>
            <Badge variant={examResultTone(e.result)}>{examResultLabel(e.result)}</Badge>
            {cancelled && <Badge variant="outline">{examStatusLabel(e.status)}</Badge>}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Данные попытки</CardTitle>
            <CardDescription>Попытки не перезаписываются: пересдача — новая запись.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <dl className="space-y-3" data-testid="exam-details">
              <Row label="Сотрудник"><Link href={`/employees/${e.employee_id}`} className="font-medium hover:text-brand hover:underline">{e.employee?.full_name ?? "—"}</Link></Row>
              <Row label="Квалификация">{e.skill?.name ?? "—"}</Row>
              <Row label="Номер попытки">{formatAttempt(e.attempt_no)}</Row>
              <Row label="Дата экзамена">{formatDate(e.exam_date)}</Row>
              <Row label="Статус">{examStatusLabel(e.status)}</Row>
              <Row label="Провайдер">{e.provider?.name ?? "—"}</Row>
              <Row label="Подготовка (тренинг)">{e.training ? <Link href={`/trainings/${e.training.id}`} className="hover:text-brand hover:underline">{e.training.title}</Link> : "—"}</Row>
              <Row label="Результат">{examResultLabel(e.result)}</Row>
              <Row label="Балл">{formatScore(e.score)}</Row>
              <Row label="Комментарий к результату">{e.result_note ?? "—"}</Row>
              <Row label="Примечание">{e.comment ?? "—"}</Row>
            </dl>
            {canEdit && !cancelled && (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <ExamResultDialog examId={id} current={{ result: e.result, score: e.score === null ? null : Number(e.score), note: e.result_note }} variant={e.result === "PENDING" ? "default" : "outline"} />
                <NewExamDialog skills={skills} providers={providers} employee={{ id: e.employee_id, name: e.employee?.full_name }} size="sm" />
                <CancelExamButton examId={id} />
              </div>
            )}
          </CardContent>
        </Card>

        {showCost && (
          <Card>
            <CardHeader>
              <CardTitle>Стоимость</CardTitle>
              <CardDescription>Финансовые данные: видны ролям с доступом к суммам.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3" data-testid="exam-cost">
              {c ? (
                <dl className="space-y-3">
                  <Row label="Сумма">{formatMoney(Number(c.fee), c.currency)}</Row>
                  <Row label="В сомони">{c.fee_tjs === null ? "—" : formatMoney(Number(c.fee_tjs))}</Row>
                  <Row label="Дата оплаты">{formatDate(c.fee_date)}</Row>
                  <Row label="Источник">{(FUNDING_SOURCE_LABELS as Record<string, string>)[c.funding_source] ?? c.funding_source}</Row>
                  {c.note && <Row label="Примечание">{c.note}</Row>}
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">Стоимость не указана.</p>
              )}
              <ExamCostDialog examId={id} cost={c ? { fee: Number(c.fee), currency: c.currency, fee_date: c.fee_date, funding_source: c.funding_source, note: c.note } : null} defaultDate={e.exam_date} />
            </CardContent>
          </Card>
        )}
        {!showCost && (
          <Card>
            <CardHeader><CardTitle>Стоимость</CardTitle></CardHeader>
            <CardContent><p className="text-sm text-muted-foreground" data-testid="exam-cost-hidden">Нет доступа к суммам.</p></CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>История попыток</CardTitle>
          <CardDescription>Все попытки этого сотрудника по квалификации «{e.skill?.name ?? "—"}».</CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {attempts.error ? (
            <ErrorState compact title="Не удалось загрузить попытки" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Попытка</TableHead>
                  <TableHead>Код</TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Результат</TableHead>
                  <TableHead className="text-right">Балл</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(attempts.data ?? []).map((a) => (
                  <TableRow key={a.id} data-testid="attempt-row" className={a.id === id ? "bg-muted/40" : undefined}>
                    <TableCell>{a.id === id ? <span className="font-medium">{formatAttempt(a.attempt_no)} (текущая)</span> : <Link href={`/exams/${a.id}`} className="hover:text-brand hover:underline">{formatAttempt(a.attempt_no)}</Link>}</TableCell>
                    <TableCell className="font-mono text-xs">{a.canonical_id}</TableCell>
                    <TableCell>{formatDate(a.exam_date)}</TableCell>
                    <TableCell><Badge variant={examResultTone(a.result)}>{examResultLabel(a.result)}</Badge>{a.status === "CANCELLED" && <Badge variant="outline" className="ml-1">Отменён</Badge>}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatScore(a.score)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Связанные сертификаты</CardTitle>
        </CardHeader>
        <CardContent>
          {!(certs.data ?? []).length ? (
            <p className="text-sm text-muted-foreground">Сертификатов, привязанных к этому экзамену, нет.</p>
          ) : (
            <ul className="space-y-2" data-testid="exam-certificates">
              {(certs.data ?? []).map((ct) => (
                <li key={ct.id ?? ct.name} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium">{ct.name}</span>
                  <span className="flex items-center gap-2 text-muted-foreground">{ct.expiration_date ? `до ${formatDate(ct.expiration_date)}` : "бессрочный"} <CertificateStatus status={ct.status} daysLeft={ct.days_left} /></span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="exam-history" className="space-y-3">
        <h2 id="exam-history" className="text-base font-semibold">История изменений</h2>
        {audit.error ? <ErrorState className="bg-card" title="Не удалось загрузить историю" /> : <AuditTimeline rows={auditRows} lookup={lookup} role={session.role} entityPath={`/exams/${id}`} />}
      </section>
    </div>
  );
}
