import Link from "next/link";
import { Award } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { CertificateStatus } from "@/components/certificates/certificate-status";
import { DocumentsPanel } from "@/components/dossier/documents-panel";
import { FeedbackPanel, type FeedbackSummary, type InvitationRow } from "@/components/trainings/feedback-panel";
import { TrainersPanel, type AssignedTrainer, type DirectoryTrainer } from "@/components/trainings/trainers-panel";
import type { AppRole } from "@/lib/auth/roles";
import { formatDate, formatNumber } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

/** Вкладки карточки обучения Phase 3A.2: тренеры, обратная связь, результаты, сертификаты, документы. Все цифры считает БД (M21). */
export async function loadAssignedTrainers(id: string): Promise<AssignedTrainer[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("training_trainers").select("trainer_id, role, trainer:trainers(full_name, kind, organization, canonical_id)").eq("training_id", id);
  return (data ?? [])
    .map((r) => {
      const t = r.trainer as { full_name: string; kind: AssignedTrainer["kind"]; organization: string | null; canonical_id: string } | null;
      return { trainerId: r.trainer_id, name: t?.full_name ?? "—", kind: t?.kind ?? "EXTERNAL", organization: t?.organization ?? null, role: (r.role === "PRIMARY" ? "PRIMARY" : "CO") as "PRIMARY" | "CO", code: t?.canonical_id ?? "" };
    })
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name, "ru") : a.role === "PRIMARY" ? -1 : 1));
}

export async function TrainersTab({ id, role, archived }: { id: string; role: AppRole; archived: boolean }) {
  const supabase = await createClient();
  const [assigned, { data: dir }] = await Promise.all([loadAssignedTrainers(id), supabase.from("trainers").select("id, full_name, kind, organization").order("full_name").limit(1000)]);
  const directory: DirectoryTrainer[] = (dir ?? []).map((d) => ({ id: d.id, name: d.full_name, kind: d.kind, organization: d.organization }));
  return <TrainersPanel trainingId={id} assigned={assigned} directory={directory} canEdit={can(role, "training")} archived={archived} />;
}

export async function FeedbackTab({ id, role, archived }: { id: string; role: AppRole; archived: boolean }) {
  const supabase = await createClient();
  const [{ data: s, error }, { data: inv }] = await Promise.all([
    supabase.rpc("training_feedback_summary", { p_training: id }),
    can(role, "participants") ? supabase.from("feedback_invitations").select("participant_id, status, employee:employees(full_name)").eq("training_id", id) : Promise.resolve({ data: [] }),
  ]);
  if (error) return <ErrorState className="bg-card" title="Не удалось загрузить обратную связь" description="Попробуйте обновить страницу." />;
  const row = s?.[0];
  const summary: FeedbackSummary = {
    invited: row?.invited ?? 0,
    answered: row?.answered ?? 0,
    response_rate: row?.response_rate === null || row?.response_rate === undefined ? null : Number(row.response_rate),
    materials: row?.materials === null || row?.materials === undefined ? null : Number(row.materials),
    trainer: row?.trainer === null || row?.trainer === undefined ? null : Number(row.trainer),
    org: row?.org === null || row?.org === undefined ? null : Number(row.org),
    final_score: row?.final_score === null || row?.final_score === undefined ? null : Number(row.final_score),
    scores_hidden: row?.scores_hidden ?? true,
  };
  const invitations: InvitationRow[] = (inv ?? [])
    .map((i) => ({ participant_id: i.participant_id, full_name: (i.employee as { full_name: string } | null)?.full_name ?? "—", status: (i.status === "ANSWERED" ? "ANSWERED" : "INVITED") as InvitationRow["status"] }))
    .sort((a, b) => a.full_name.localeCompare(b.full_name, "ru"));
  return <FeedbackPanel trainingId={id} summary={summary} invitations={invitations} canManage={can(role, "training")} canInvite={can(role, "training")} archived={archived} />;
}

const RESULT_LABELS: Record<string, string> = { ENROLLED: "Записан", PARTIAL: "Частично посетил", ABSENT: "Не посещал", COMPLETED: "Завершил", NOT_COMPLETED: "Не завершил", FAILED: "Не сдал", CERTIFIED: "Сертификат выдан" };
const RESULT_TONE: Record<string, "default" | "success" | "warning" | "outline"> = { CERTIFIED: "success", COMPLETED: "success", FAILED: "warning", NOT_COMPLETED: "warning", ABSENT: "outline", PARTIAL: "outline", ENROLLED: "outline" };

export async function ResultsTab({ id }: { id: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("training_results", { p_training: id });
  if (error) return <ErrorState className="bg-card" title="Не удалось загрузить результаты" description="Попробуйте обновить страницу." />;
  const rows = data ?? [];
  if (rows.length === 0) return <EmptyState className="bg-card" compact title="Участников нет" description="Результаты появятся после добавления участников." />;
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <div className="space-y-3" data-testid="results-tab">
      <p className="text-sm" data-testid="results-counts">
        Записано: <strong>{rows.length}</strong> · Посетили: <strong>{rows.filter((r) => r.attended).length}</strong> · Завершили: <strong>{count("COMPLETED") + count("CERTIFIED")}</strong> · Не завершили/не сдали: <strong>{count("NOT_COMPLETED") + count("FAILED")}</strong> · Сертификатов: <strong>{count("CERTIFIED")}</strong>
      </p>
      <ul className="divide-y rounded-xl border bg-card shadow-xs">
        {rows.map((r) => (
          <li key={r.participant_id ?? ""} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="result-row">
            <div className="min-w-0">
              <Link href={`/employees/${r.employee_id}`} className="font-medium hover:text-brand hover:underline">{r.full_name}</Link>
              <p className="text-xs text-muted-foreground">Заходов: {r.sessions_present}/{r.sessions_total}{r.exam_result ? ` · экзамен: ${r.exam_result}` : ""}{r.certificate_number ? ` · сертификат № ${r.certificate_number}` : ""}</p>
            </div>
            <Badge variant={RESULT_TONE[r.status ?? "ENROLLED"] ?? "outline"}>{RESULT_LABELS[r.status ?? "ENROLLED"] ?? r.status}</Badge>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">Итог участника отмечается на вкладке «Участники»; сертификат выдаётся в досье сотрудника с привязкой к этому обучению.</p>
    </div>
  );
}

export async function CertificatesForTraining({ id }: { id: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("v_certificates").select("id, employee_id, name, certificate_number, issue_date, expiration_date, status, days_left, employee:employees(full_name)").eq("training_id", id).is("archived_at", null).order("issue_date", { ascending: false });
  if (error) return <ErrorState className="bg-card" compact title="Не удалось загрузить сертификаты" />;
  if (!data?.length) return <EmptyState className="bg-card" compact icon={Award} title="Сертификатов по этому обучению нет" description="Сертификат выдаётся в досье сотрудника: вкладка «Сертификаты» → «Добавить» с привязкой к обучению." />;
  return (
    <ul className="divide-y rounded-xl border bg-card shadow-xs" data-testid="training-certificates">
      {data.map((c) => (
        <li key={c.id ?? ""} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="training-certificate-row">
          <div className="min-w-0">
            <Link href={`/employees/${c.employee_id}?tab=certificates`} className="font-medium hover:text-brand hover:underline">{(c.employee as { full_name: string } | null)?.full_name ?? "—"}</Link>
            <p className="text-xs text-muted-foreground">{c.name}{c.certificate_number ? ` · № ${c.certificate_number}` : ""} · выдан {formatDate(c.issue_date)}{c.expiration_date ? ` · до ${formatDate(c.expiration_date)}` : " · бессрочно"}</p>
          </div>
          <CertificateStatus status={c.status} daysLeft={c.days_left} />
        </li>
      ))}
    </ul>
  );
}

export function DocumentsForTraining({ id, role }: { id: string; role: AppRole }) {
  return <DocumentsPanel role={role} scope={{ trainingId: id }} title="Документы обучения" />;
}

export type TrainingSummary = {
  planned_participants: number | null; added_participants: number; present_participants: number; completed_participants: number;
  actual_cost_tjs: number | null; cost_per_participant: number | null; cost_per_learning_hour: number | null; remaining_budget_tjs: number | null; budget_tjs: number | null;
};

/** «Запланировано: 30 / Добавлено: 27 / Присутствовало: 25 / Завершили: 24» — фактические числа считает БД по записям. */
export function ParticipantFunnel({ s }: { s: TrainingSummary }) {
  return (
    <p className="text-sm" data-testid="participant-funnel">
      Запланировано: <strong>{s.planned_participants === null ? "—" : formatNumber(s.planned_participants)}</strong> / Добавлено: <strong>{formatNumber(s.added_participants)}</strong> / Присутствовало: <strong>{formatNumber(s.present_participants)}</strong> / Завершили: <strong>{formatNumber(s.completed_participants)}</strong>
    </p>
  );
}
