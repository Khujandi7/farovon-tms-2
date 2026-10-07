"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Plus, UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { EmptyState } from "@/components/common/states";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { assignTrainer, createTrainer, removeTrainer } from "@/app/(app)/trainings/lifecycle-actions";

export type TrainerKind = "INTERNAL" | "EXTERNAL" | "ORGANIZATION";
export const TRAINER_KIND_LABELS: Record<TrainerKind, string> = { INTERNAL: "Внутренний", EXTERNAL: "Внешний", ORGANIZATION: "Организация" };
export type AssignedTrainer = { trainerId: string; name: string; kind: TrainerKind; organization: string | null; role: "PRIMARY" | "CO"; code: string };
export type DirectoryTrainer = { id: string; name: string; kind: TrainerKind; organization: string | null };

/** Тренеры мероприятия: основной (один) и со-тренеры; справочник общий — дубликаты ФИО отклоняет БД. */
export function TrainersPanel({ trainingId, assigned, directory, canEdit, archived }: { trainingId: string; assigned: AssignedTrainer[]; directory: DirectoryTrainer[]; canEdit: boolean; archived: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [removing, setRemoving] = useState<AssignedTrainer | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const editable = canEdit && !archived;
  const free = directory.filter((d) => !assigned.some((a) => a.trainerId === d.id));

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string }>, form?: HTMLFormElement) {
    setError(undefined);
    startTransition(async () => {
      const r = await fn();
      if (r.ok) {
        notify(true, r.message ?? "Сохранено.");
        form?.reset();
        router.refresh();
      } else setError(r.error);
    });
  }

  return (
    <div className="space-y-3" data-testid="trainers-panel">
      {assigned.length === 0 ? (
        <EmptyState className="bg-card" compact title="Тренер не назначен" description="Назначьте основного тренера: он нужен для обратной связи и отчётов." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {assigned.map((t) => (
            <li key={t.trainerId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm" data-testid="trainer-row">
              <div className="min-w-0">
                <Link href={`/trainers/${t.trainerId}`} className="font-medium hover:text-brand hover:underline">{t.name}</Link>
                <p className="text-xs text-muted-foreground">{t.code} · {TRAINER_KIND_LABELS[t.kind]}{t.organization ? ` · ${t.organization}` : ""}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={t.role === "PRIMARY" ? "default" : "outline"}>{t.role === "PRIMARY" ? "Основной" : "Со-тренер"}</Badge>
                {editable && t.role === "CO" && (
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => assignTrainer({ trainingId, trainerId: t.trainerId, role: "PRIMARY" }))}>Сделать основным</Button>
                )}
                {editable && (
                  <Button size="icon" variant="ghost" aria-label={`Снять тренера ${t.name}`} onClick={() => setRemoving(t)}><UserMinus aria-hidden="true" /></Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <form
          className="grid gap-3 rounded-xl border bg-card p-3 shadow-xs"
          data-testid="trainer-form"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const fd = new FormData(form);
            const role = String(fd.get("role") ?? "CO") as "PRIMARY" | "CO";
            if (mode === "existing") run(() => assignTrainer({ trainingId, trainerId: fd.get("trainer"), role }), form);
            else run(() => createTrainer({ trainingId, full_name: fd.get("full_name"), kind: fd.get("kind"), organization: fd.get("organization"), role }), form);
          }}
        >
          <FormAlert error={error} />
          <div className="flex gap-2" role="group" aria-label="Источник тренера">
            <Button type="button" size="sm" variant={mode === "existing" ? "default" : "outline"} onClick={() => setMode("existing")}>Из справочника</Button>
            <Button type="button" size="sm" variant={mode === "new" ? "default" : "outline"} onClick={() => setMode("new")} data-testid="trainer-new-mode">Новый тренер</Button>
          </div>
          {mode === "existing" ? (
            <div className="grid gap-2">
              <Label htmlFor="trainer">Тренер</Label>
              <Select id="trainer" name="trainer" required defaultValue="" disabled={pending}>
                <option value="" disabled>{free.length ? "Выберите тренера" : "Справочник пуст — добавьте нового"}</option>
                {free.map((d) => <option key={d.id} value={d.id}>{d.name} · {TRAINER_KIND_LABELS[d.kind]}{d.organization ? ` · ${d.organization}` : ""}</option>)}
              </Select>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field id="full_name" label="ФИО *" disabled={pending} />
              <div className="grid gap-2">
                <Label htmlFor="kind">Тип</Label>
                <Select id="kind" name="kind" defaultValue="EXTERNAL" disabled={pending}>
                  {(Object.keys(TRAINER_KIND_LABELS) as TrainerKind[]).map((k) => <option key={k} value={k}>{TRAINER_KIND_LABELS[k]}</option>)}
                </Select>
              </div>
              <Field id="organization" label="Организация" disabled={pending} />
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-2">
              <Label htmlFor="role">Роль</Label>
              <Select id="role" name="role" defaultValue={assigned.some((a) => a.role === "PRIMARY") ? "CO" : "PRIMARY"} disabled={pending}>
                <option value="PRIMARY">Основной</option>
                <option value="CO">Со-тренер</option>
              </Select>
            </div>
            <Button type="submit" disabled={pending} data-testid="assign-trainer">
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />} Назначить
            </Button>
          </div>
        </form>
      )}

      <ReasonDialog
        open={removing !== null}
        title={`Снять тренера ${removing?.name ?? ""}`}
        description="Тренер будет снят с обучения и с его заходов. История сохранится в журнале."
        confirmLabel="Снять"
        destructive
        testId="remove-trainer-dialog"
        onClose={() => setRemoving(null)}
        onConfirm={(reason) => removeTrainer({ trainingId, trainerId: removing?.trainerId ?? "", reason })}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
