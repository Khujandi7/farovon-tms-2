"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { createTrainingFromRequest, saveRequestDetails } from "@/app/(app)/trainings/lifecycle-actions";

export const PRIORITY_LABELS = { LOW: "Низкий", NORMAL: "Обычный", HIGH: "Высокий", URGENT: "Срочный" } as const;
export type Priority = keyof typeof PRIORITY_LABELS;

/** Заявка → обучение: кнопка «Создать обучение» переносит тему, цель, участников, формат и тип из заявки; вводятся только даты и часы. */
export function RequestLifecyclePanel({ requestId, status, priority, expectedResult, canEdit, hasTraining }: { requestId: string; status: string; priority: Priority; expectedResult: string | null; canEdit: boolean; hasTraining: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const convertible = canEdit && (status === "APPROVED" || status === "PLANNED");

  return (
    <div className="space-y-3" data-testid="request-lifecycle">
      <form
        className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const r = await saveRequestDetails({ id: requestId, priority: fd.get("priority"), expected_result: fd.get("expected_result") });
            notify(r.ok, r.ok ? (r.message ?? "Сохранено.") : r.error);
            if (r.ok) router.refresh();
          });
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor="priority">Приоритет</Label>
          <Select id="priority" name="priority" defaultValue={priority} disabled={!canEdit || pending}>
            {(Object.keys(PRIORITY_LABELS) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </Select>
        </div>
        <Field id="expected_result" label="Ожидаемый результат" defaultValue={expectedResult ?? ""} disabled={!canEdit || pending} />
        {canEdit && <Button type="submit" variant="outline" disabled={pending}>Сохранить</Button>}
      </form>
      {convertible && (
        <>
          <Button onClick={() => { setError(undefined); setOpen(true); }} data-testid="create-training-from-request">
            <GraduationCap aria-hidden="true" /> {hasTraining ? "Создать ещё одно обучение" : "Создать обучение"}
          </Button>
          <Button asChild variant="outline" className="ml-2" data-testid="create-training-with-participants">
            <Link href={`/trainings/new?request=${requestId}`}>Создать с выбором участников</Link>
          </Button>
          <Dialog open={open} onOpenChange={(o) => !o && !pending && setOpen(false)}>
            <DialogContent data-testid="from-request-dialog">
              <DialogHeader>
                <DialogTitle>Создать обучение из заявки</DialogTitle>
                <DialogDescription>Тема, цель, число участников, формат и тип берутся из заявки. Укажите даты и часы.</DialogDescription>
              </DialogHeader>
              <form
                className="grid gap-4"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  setError(undefined);
                  startTransition(async () => {
                    const r = await createTrainingFromRequest({ requestId, start_date: fd.get("start_date"), end_date: fd.get("end_date"), hours: fd.get("hours") });
                    if (r.ok) { notify(true, r.message ?? "Создано."); router.push(`/trainings/${r.data.id}`); } else setError(r.error);
                  });
                }}
              >
                <FormAlert error={error} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field id="start_date" label="Начало *" type="date" disabled={pending} />
                  <Field id="end_date" label="Окончание" type="date" disabled={pending} />
                  <Field id="hours" label="Часы *" inputMode="decimal" disabled={pending} />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Отмена</Button>
                  <Button type="submit" disabled={pending} data-testid="from-request-submit">{pending && <Loader2 className="animate-spin" aria-hidden="true" />} Создать</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      )}
      {!convertible && canEdit && !hasTraining && <p className="text-xs text-muted-foreground">Обучение создаётся из утверждённой или запланированной заявки.</p>}
    </div>
  );
}
