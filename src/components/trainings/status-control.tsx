"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/workflow/toast";
import { updateTrainingField } from "@/app/(app)/trainings/actions";
import { TRAINING_STATUS_LABELS, TRAINING_STATUS_VARIANT } from "@/lib/labels";
import { allowedNextStatuses, isAdminOverride, isLifecycleStatus, type LifecycleStatus } from "@/lib/trainings/lifecycle";

/**
 * Смена статуса мероприятия. В списке только разрешённые переходы (таблица зеркалит SQL training_transition_allowed).
 * ADMIN видит все статусы: переход вне таблицы — исправление, причина обязательна (как и для любой смены статуса).
 * Окончательное решение принимает БД: недопустимый переход она отклонит понятным сообщением.
 */
export function StatusControl({ trainingId, status, isAdmin, canEdit }: { trainingId: string; status: string; isAdmin: boolean; canEdit: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [editing, setEditing] = useState(false);
  const [next, setNext] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const current = isLifecycleStatus(status) ? status : null;
  const options = allowedNextStatuses(status, isAdmin);
  const label = current ? TRAINING_STATUS_LABELS[current] : status;

  function open() {
    setNext("");
    setReason("");
    setError(undefined);
    setEditing(true);
  }
  function save() {
    if (!next) return setError("Выберите новый статус.");
    if (reason.trim().length < 3) return setError("Укажите причину изменения (не короче 3 символов).");
    setError(undefined);
    start(async () => {
      const r = await updateTrainingField({ id: trainingId, field: "status", value: next, reason: reason.trim() });
      if (r.ok) {
        notify(true, "Статус изменён.");
        setEditing(false);
        router.refresh();
      } else setError(r.fieldErrors?.value ?? r.fieldErrors?.reason ?? r.error);
    });
  }

  if (!editing) {
    return (
      <div className="group grid gap-0.5" data-testid="field-status">
        <dt className="text-xs text-muted-foreground">Статус</dt>
        <dd className="flex min-h-7 items-start gap-1.5 text-sm">
          <span className="min-w-0 flex-1">{current ? <Badge variant={TRAINING_STATUS_VARIANT[current]}>{label}</Badge> : label}</span>
          {canEdit && options.length > 0 && (
            <button
              type="button"
              onClick={open}
              aria-label="Изменить: Статус"
              title="Изменить: Статус"
              className="rounded p-1 text-muted-foreground transition-opacity hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
          )}
        </dd>
      </div>
    );
  }

  const override = next !== "" && isAdminOverride(status, next);
  return (
    <div className="grid gap-2 rounded-lg border bg-card p-3 shadow-xs" data-testid="field-status-editor">
      <label htmlFor={`status-${trainingId}`} className="text-xs font-medium text-muted-foreground">
        Статус
      </label>
      <p className="text-xs text-muted-foreground">Сейчас: {label}. Показаны только допустимые переходы{isAdmin ? "; остальные — как исправление, с причиной" : ""}.</p>
      <Select id={`status-${trainingId}`} value={next} onChange={(e) => setNext(e.target.value)} disabled={pending} autoFocus data-testid="status-select">
        <option value="">— выберите —</option>
        {options.map((s: LifecycleStatus) => (
          <option key={s} value={s}>
            {TRAINING_STATUS_LABELS[s]}
            {isAdmin && isAdminOverride(status, s) ? " (исправление)" : ""}
          </option>
        ))}
      </Select>
      {override && <p className="text-xs text-warning">Этот переход вне обычного порядка: его может выполнить только администратор, причина попадёт в журнал.</p>}
      <label htmlFor={`status-${trainingId}-reason`} className="text-xs font-medium text-muted-foreground">
        Причина изменения *
      </label>
      <Input id={`status-${trainingId}-reason`} value={reason} disabled={pending} onChange={(e) => setReason(e.target.value)} placeholder="Почему меняется статус" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())} />
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />} Сохранить
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)} disabled={pending}>
          <X aria-hidden="true" /> Отмена
        </Button>
      </div>
    </div>
  );
}
