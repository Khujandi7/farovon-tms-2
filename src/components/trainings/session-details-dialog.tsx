"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { saveSessionDetails } from "@/app/(app)/trainings/lifecycle-actions";

export type SessionDetails = { id: string; session_no: number; start_time: string | null; end_time: string | null; room: string | null; trainer_id: string | null; status: "PLANNED" | "HELD" | "CANCELLED" };
export const SESSION_STATUS_LABELS = { PLANNED: "Запланирован", HELD: "Проведён", CANCELLED: "Отменён" } as const;
const hhmm = (v: string | null) => (v ? v.slice(0, 5) : "");

/** Время, аудитория, тренер и статус захода. Тренер захода выбирается из назначенных на обучение. */
export function SessionDetailsDialog({ trainingId, session, trainers }: { trainingId: string; session: SessionDetails; trainers: { id: string; name: string }[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  return (
    <>
      <Button size="icon" variant="ghost" aria-label={`Детали захода ${session.session_no}`} onClick={() => { setError(undefined); setOpen(true); }} data-testid="session-details-open">
        <Settings2 aria-hidden="true" />
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !pending && setOpen(false)}>
        <DialogContent data-testid="session-details-dialog">
          <DialogHeader>
            <DialogTitle>Заход {session.session_no}: детали</DialogTitle>
            <DialogDescription>Время, аудитория, тренер и статус. Отмена захода требует причины.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              setError(undefined);
              startTransition(async () => {
                const r = await saveSessionDetails({ trainingId, sessionId: session.id, start_time: fd.get("start_time"), end_time: fd.get("end_time"), room: fd.get("room"), trainer_id: fd.get("trainer_id"), status: fd.get("status"), reason: fd.get("reason") });
                if (r.ok) { notify(true, r.message ?? "Сохранено."); setOpen(false); router.refresh(); } else setError(r.error);
              });
            }}
          >
            <FormAlert error={error} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="start_time" label="Начало" type="time" defaultValue={hhmm(session.start_time)} disabled={pending} />
              <Field id="end_time" label="Окончание" type="time" defaultValue={hhmm(session.end_time)} disabled={pending} />
            </div>
            <Field id="room" label="Аудитория / зал" defaultValue={session.room ?? ""} disabled={pending} />
            <div className="grid gap-2">
              <Label htmlFor="trainer_id">Тренер захода</Label>
              <Select id="trainer_id" name="trainer_id" defaultValue={session.trainer_id ?? ""} disabled={pending}>
                <option value="">Не указан</option>
                {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="status">Статус</Label>
              <Select id="status" name="status" defaultValue={session.status} disabled={pending}>
                {(Object.keys(SESSION_STATUS_LABELS) as (keyof typeof SESSION_STATUS_LABELS)[]).map((s) => <option key={s} value={s}>{SESSION_STATUS_LABELS[s]}</option>)}
              </Select>
            </div>
            <Field id="reason" label="Причина (обязательна при отмене)" disabled={pending} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Отмена</Button>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />} Сохранить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
