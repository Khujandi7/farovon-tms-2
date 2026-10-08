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
import { ParticipantPicker } from "@/components/trainings/participant-picker";
import type { PickEmployee, PickUnit } from "@/lib/trainings/participant-filter";

export type RequestOption = { id: string; label: string };
export type TypeOption = { id: number; code: string; name: string };
export type ProviderOpt = { id: string; name: string };
/** Заявка-источник: её данные подставляются в форму (Заявка → Обучение без повторного ввода). */
export type InitialRequest = { id: string; topic: string; goal: string | null; participants_planned: number | null; format: string | null; kind: string | null };

export function TrainingForm({ requests, eventTypes = [], providers = [], employees = [], units = [], initialRequest = null }: { requests: RequestOption[]; eventTypes?: TypeOption[]; providers?: ProviderOpt[]; employees?: PickEmployee[]; units?: PickUnit[]; initialRequest?: InitialRequest | null }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [requestId, setRequestId] = useState(initialRequest?.id ?? "");
  const [participants, setParticipants] = useState<string[]>([]);
  const [planned, setPlanned] = useState<string>(initialRequest?.participants_planned != null ? String(initialRequest.participants_planned) : "");

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
        event_type_id: fd.get("event_type_id") || null,
        provider_id: fd.get("provider_id") || null,
        organizer: fd.get("organizer"),
        status: fd.get("status") || null,
        employee_ids: participants,
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
      className="grid grid-cols-1 max-w-3xl gap-5 rounded-xl border bg-card p-5 shadow-xs"
      onSubmit={(e) => {
        e.preventDefault();
        submit(e.currentTarget);
      }}
      data-testid="training-form"
      noValidate
    >
      <FormAlert error={error} />
      <Field id="title" label="Название *" error={fieldErrors.title} disabled={pending} maxLength={300} autoComplete="off" defaultValue={initialRequest?.topic ?? ""} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="event_type_id">Тип мероприятия</Label>
          <Select id="event_type_id" name="event_type_id" defaultValue={eventTypes.find((t) => t.code === "TRAINING")?.id ?? ""} disabled={pending} data-testid="event-type-select">
            {eventTypes.length === 0 && <option value="">Обучение (по умолчанию)</option>}
            {eventTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          {fieldErrors.event_type_id && <p className="text-xs text-destructive">{fieldErrors.event_type_id}</p>}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="provider_id">Провайдер</Label>
          <Select id="provider_id" name="provider_id" defaultValue="" disabled={pending}>
            <option value="">— не выбран —</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </Select>
        </div>
        <Field id="organizer" label="Организатор" disabled={pending} maxLength={300} autoComplete="off" hint="Если не совпадает с провайдером" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field id="start_date" label="Дата начала *" type="date" error={fieldErrors.start_date} disabled={pending} />
        <Field id="end_date" label="Дата окончания" type="date" error={fieldErrors.end_date} disabled={pending} hint="Пусто — один день" />
        <Field id="hours" label="Часы *" inputMode="decimal" error={fieldErrors.hours} disabled={pending} hint="Позже считается по заходам" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="format">Формат</Label>
          <Select id="format" name="format" defaultValue={initialRequest?.format ?? "OFFLINE"} disabled={pending}>
            {TRAINING_FORMAT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="kind">Внутреннее / внешнее</Label>
          <Select id="kind" name="kind" defaultValue={initialRequest?.kind ?? "UNSPECIFIED"} disabled={pending}>
            {TRAINING_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
        <Field id="participants_planned" label="Участников по плану" inputMode="numeric" error={fieldErrors.participants_planned} disabled={pending} value={planned} onChange={(e) => setPlanned(e.target.value)} />
      </div>
      <div className="grid gap-2 sm:max-w-xs">
        <Label htmlFor="status">Начальный статус</Label>
        <Select id="status" name="status" defaultValue="PLANNED" disabled={pending}>
          <option value="PLANNED">Запланировано</option>
          <option value="DRAFT">Черновик</option>
        </Select>
      </div>
      <Field id="location" label="Место проведения" disabled={pending} maxLength={300} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <Textarea id="description" name="description" rows={3} disabled={pending} maxLength={2000} defaultValue={initialRequest?.goal ?? ""} />
      </div>
      <div className="border-t pt-5">
        <ParticipantPicker employees={employees} units={units} value={participants} onChange={setParticipants} disabled={pending} planned={planned.trim() ? Number(planned) : null} />
        {fieldErrors.employee_ids && <p className="mt-2 text-xs text-destructive">{fieldErrors.employee_ids}</p>}
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {participants.length ? `Создать тренинг и добавить ${participants.length}` : "Создать тренинг"}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.push("/trainings")} disabled={pending}>
          Отмена
        </Button>
      </div>
    </form>
  );
}
