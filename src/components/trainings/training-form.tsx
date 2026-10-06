"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { createTraining } from "@/app/(app)/trainings/actions";
import { TRAINING_FORMAT_OPTIONS, TRAINING_KIND_OPTIONS, UNPLANNED_REASON_OPTIONS } from "@/lib/labels";

export type RequestOption = { id: string; label: string };

export function TrainingForm({ requests }: { requests: RequestOption[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [requestId, setRequestId] = useState("");

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFieldErrors({});
    startTransition(async () => {
      const result = await createTraining({
        title: fd.get("title"),
        start_date: fd.get("start_date"),
        end_date: fd.get("end_date") || null,
        hours: fd.get("hours"),
        format: fd.get("format"),
        kind: fd.get("kind"),
        location: fd.get("location"),
        request_id: requestId || null,
        unplanned_reason: requestId ? null : fd.get("unplanned_reason") || null,
        participants_planned: fd.get("participants_planned"),
        description: fd.get("description"),
      });
      if (result.ok) {
        notify(true, result.message ?? "Тренинг создан.");
        router.push(`/trainings/${result.data.id}`);
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form
      className="grid max-w-3xl gap-5 rounded-xl border bg-card p-5 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      data-testid="training-form"
      noValidate
    >
      <FormAlert error={error} />
      <Field id="title" label="Название *" error={fieldErrors.title} disabled={pending} maxLength={300} autoComplete="off" />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="start_date" label="Дата начала *" type="date" error={fieldErrors.start_date} disabled={pending} />
        <Field id="end_date" label="Дата окончания" type="date" error={fieldErrors.end_date} disabled={pending} hint="Пусто — один день" />
        <Field id="hours" label="Часы *" inputMode="decimal" error={fieldErrors.hours} disabled={pending} hint="Позже считается по заходам" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="format">Формат</Label>
          <Select id="format" name="format" defaultValue="OFFLINE" disabled={pending}>
            {TRAINING_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kind">Тип</Label>
          <Select id="kind" name="kind" defaultValue="UNSPECIFIED" disabled={pending}>
            {TRAINING_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <Field id="participants_planned" label="Участников по плану" inputMode="numeric" error={fieldErrors.participants_planned} disabled={pending} />
      </div>
      <Field id="location" label="Место проведения" disabled={pending} maxLength={300} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="request_id">Заявка</Label>
          <Select id="request_id" value={requestId} onChange={(e) => setRequestId(e.target.value)} disabled={pending}>
            <option value="">Без заявки (внеплановое)</option>
            {requests.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">С заявкой тренинг плановый, без неё — внеплановый. Привязать позже можно в карточке.</p>
        </div>
        {!requestId && (
          <div className="grid gap-2">
            <Label htmlFor="unplanned_reason">Причина внепланового</Label>
            <Select id="unplanned_reason" name="unplanned_reason" defaultValue="" disabled={pending}>
              {UNPLANNED_REASON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Описание</Label>
        <Textarea id="description" name="description" rows={3} disabled={pending} maxLength={2000} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          Создать тренинг
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/trainings")} disabled={pending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
