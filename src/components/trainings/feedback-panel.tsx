"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { useToast } from "@/components/workflow/toast";
import { recordFeedback, sendFeedbackInvitations } from "@/app/(app)/trainings/lifecycle-actions";
import { formatDecimal } from "@/lib/format";

export type FeedbackSummary = { invited: number; answered: number; response_rate: number | null; materials: number | null; trainer: number | null; org: number | null; final_score: number | null; scores_hidden: boolean };
export type InvitationRow = { participant_id: string; full_name: string; status: "INVITED" | "ANSWERED" };

const fmt = (v: number | null) => formatDecimal(v);

/** Обратная связь по обучению: приглашено / ответило / доля ответов, оценки по блокам, итог 40/40/20. Оценки скрыты ниже порога анонимности (Phase 1.5). */
export function FeedbackPanel({ trainingId, summary, invitations, canManage, archived, canInvite }: { trainingId: string; summary: FeedbackSummary; invitations: InvitationRow[]; canManage: boolean; archived: boolean; canInvite: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  const [answering, setAnswering] = useState<InvitationRow | null>(null);
  const [error, setError] = useState<string | undefined>();
  const editable = canManage && !archived;

  function send() {
    startTransition(async () => {
      const r = await sendFeedbackInvitations({ trainingId });
      notify(r.ok, r.ok ? (r.message ?? "Готово.") : r.error);
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4" data-testid="feedback-panel">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Показатели обратной связи">
        <Stat label="Приглашено" value={String(summary.invited)} testId="fb-invited" />
        <Stat label="Ответило" value={String(summary.answered)} testId="fb-answered" />
        <Stat label="Доля ответов" value={summary.response_rate === null ? "—" : `${fmt(summary.response_rate)}%`} testId="fb-rate" />
        <Stat label="Итоговая оценка" value={summary.scores_hidden ? "Скрыта" : fmt(summary.final_score)} sub={summary.scores_hidden ? "мало ответов для анонимности" : "материалы 40 · тренер 40 · организация 20"} testId="fb-final" />
      </section>
      {!summary.scores_hidden && (
        <p className="text-sm text-muted-foreground" data-testid="fb-blocks">Материалы: {fmt(summary.materials)} · Тренер: {fmt(summary.trainer)} · Организация: {fmt(summary.org)}</p>
      )}
      {canInvite && editable && (
        <Button onClick={send} disabled={pending} data-testid="send-feedback">
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />} Отправить обратную связь
        </Button>
      )}
      {invitations.length === 0 ? (
        <EmptyState className="bg-card" compact title="Приглашений нет" description="Приглашения получают участники проведённого обучения. Нажмите «Отправить обратную связь»." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {invitations.map((i) => (
            <li key={i.participant_id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="invitation-row">
              <span>{i.full_name}</span>
              <span className="flex items-center gap-2">
                <Badge variant={i.status === "ANSWERED" ? "success" : "outline"}>{i.status === "ANSWERED" ? "Ответил" : "Приглашён"}</Badge>
                {editable && i.status === "INVITED" && (
                  <Button size="sm" variant="outline" onClick={() => { setError(undefined); setAnswering(i); }}>Ввести анкету</Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={answering !== null} onOpenChange={(o) => !o && !pending && setAnswering(null)}>
        <DialogContent data-testid="feedback-dialog">
          <DialogHeader>
            <DialogTitle>Анкета: {answering?.full_name}</DialogTitle>
            <DialogDescription>Оценки от 1 до 5. Личность респондента хранится отдельно от ответов.</DialogDescription>
          </DialogHeader>
          {answering && (
            <form
              className="grid gap-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                setError(undefined);
                startTransition(async () => {
                  const r = await recordFeedback({ trainingId, participantId: answering.participant_id, materials: fd.get("materials"), trainer: fd.get("trainer"), org: fd.get("org"), comment: fd.get("comment") });
                  if (r.ok) { notify(true, r.message ?? "Сохранено."); setAnswering(null); router.refresh(); } else setError(r.error);
                });
              }}
            >
              <FormAlert error={error} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="materials" label="Материалы *" inputMode="numeric" disabled={pending} />
                <Field id="trainer" label="Тренер *" inputMode="numeric" disabled={pending} />
                <Field id="org" label="Организация *" inputMode="numeric" disabled={pending} />
              </div>
              <Field id="comment" label="Комментарий" disabled={pending} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAnswering(null)} disabled={pending}>Отмена</Button>
                <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />} Сохранить</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({ label, value, sub, testId }: { label: string; value: string; sub?: string; testId: string }) {
  return (
    <div className="rounded-xl border bg-card p-3 shadow-xs">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums" data-testid={testId}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
