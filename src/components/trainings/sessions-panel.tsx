"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { deleteSession, saveSession } from "@/app/(app)/trainings/actions";
import { formatDateRange, formatNumber } from "@/lib/format";

export type SessionRow = { id: string; session_no: number; start_date: string; end_date: string; hours: number; location: string | null; comment: string | null; present: number };

/** Заходы тренинга. Часы и даты тренинга считаются по заходам; правка часов/дат захода требует причину. */
export function SessionsPanel({ trainingId, sessions, canEdit, archived }: { trainingId: string; sessions: SessionRow[]; canEdit: boolean; archived: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [editing, setEditing] = useState<SessionRow | "new" | null>(null);
  const [deleting, setDeleting] = useState<SessionRow | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const editable = canEdit && !archived;
  const current = editing && editing !== "new" ? editing : null;

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFieldErrors({});
    startTransition(async () => {
      const result = await saveSession({
        trainingId,
        sessionId: current?.id ?? null,
        values: { start_date: fd.get("start_date"), end_date: fd.get("end_date") || fd.get("start_date"), hours: fd.get("hours"), location: fd.get("location"), comment: fd.get("comment") },
        reason: String(fd.get("reason") ?? ""),
      });
      if (result.ok) {
        notify(true, result.message ?? "Сохранено.");
        setEditing(null);
        router.refresh();
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <div className="space-y-3" data-testid="sessions-panel">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Часы и даты тренинга = сумма по заходам. Новый заход по умолчанию отмечает присутствие всех участников.</p>
        {editable && (
          <Button size="sm" onClick={() => { setError(undefined); setFieldErrors({}); setEditing("new"); }} data-testid="add-session">
            <Plus aria-hidden="true" /> Добавить заход
          </Button>
        )}
      </div>
      {sessions.length === 0 ? (
        <EmptyState className="bg-card" compact title="Заходов пока нет" description="Добавьте заход, если тренинг проходит в несколько дат или блоков." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {sessions.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm" data-testid="session-row">
              <div className="min-w-0">
                <p className="font-medium">
                  Заход {s.session_no} · {formatDateRange(s.start_date, s.end_date)} · {formatNumber(s.hours)} ч
                </p>
                <p className="text-xs text-muted-foreground">
                  Присутствовали: {s.present}
                  {s.location ? ` · ${s.location}` : ""}
                  {s.comment ? ` · ${s.comment}` : ""}
                </p>
              </div>
              {editable && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label={`Изменить заход ${s.session_no}`} onClick={() => { setError(undefined); setFieldErrors({}); setEditing(s); }}>
                    <Pencil aria-hidden="true" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={`Удалить заход ${s.session_no}`} onClick={() => setDeleting(s)}>
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && !pending && setEditing(null)}>
        <DialogContent data-testid="session-dialog">
          <DialogHeader>
            <DialogTitle>{current ? `Заход ${current.session_no}` : "Новый заход"}</DialogTitle>
            <DialogDescription>{current ? "Изменение часов или дат требует причины и пересчитывает часы тренинга." : "Укажите даты и часы захода."}</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              key={current?.id ?? "new"}
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit(e.currentTarget);
              }}
              noValidate
            >
              <FormAlert error={error} />
              <div className="grid gap-4 sm:grid-cols-3">
                <Field id="start_date" label="Начало *" type="date" defaultValue={current?.start_date ?? ""} error={fieldErrors.start_date} disabled={pending} />
                <Field id="end_date" label="Окончание" type="date" defaultValue={current?.end_date ?? ""} error={fieldErrors.end_date} disabled={pending} />
                <Field id="hours" label="Часы *" inputMode="decimal" defaultValue={current ? String(current.hours) : ""} error={fieldErrors.hours} disabled={pending} />
              </div>
              <Field id="location" label="Место" defaultValue={current?.location ?? ""} disabled={pending} />
              <Field id="comment" label="Комментарий" defaultValue={current?.comment ?? ""} disabled={pending} />
              <Field id="reason" label={current ? "Причина изменения (обязательна при смене часов/дат)" : "Причина (необязательно)"} error={fieldErrors.reason} disabled={pending} />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={pending}>Отмена</Button>
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Сохранить
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={deleting !== null}
        title={`Удалить заход ${deleting?.session_no ?? ""}`}
        description="Отметки посещаемости этого захода будут удалены, часы тренинга пересчитаются. Действие можно отменить в журнале изменений."
        confirmLabel="Удалить заход"
        destructive
        testId="delete-session-dialog"
        onClose={() => setDeleting(null)}
        onConfirm={(reason) => deleteSession({ id: deleting?.id ?? "", trainingId, reason })}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
