"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { createRequest } from "@/app/(app)/trainings/requests/actions";
import { TRAINING_FORMAT_OPTIONS } from "@/lib/labels";

export function NewRequestDialog({ defaultYear }: { defaultYear: number }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFieldErrors({});
    startTransition(async () => {
      const result = await createRequest({
        plan_year: fd.get("plan_year"),
        topic: fd.get("topic"),
        direction: fd.get("direction"),
        goal: fd.get("goal"),
        participants_planned: fd.get("participants_planned"),
        format: fd.get("format") || null,
        budget_amount: String(fd.get("budget_amount") ?? "").replace(",", "."),
        requester_raw: fd.get("requester_raw"),
        comment: fd.get("comment"),
      });
      if (result.ok) {
        notify(true, result.message ?? "Заявка создана.");
        setOpen(false);
        router.push(`/trainings/requests/${result.data.id}`);
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="new-request">
        <Plus aria-hidden="true" /> Новая заявка
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-w-xl" data-testid="request-dialog">
          <DialogHeader>
            <DialogTitle>Новая заявка на обучение</DialogTitle>
            <DialogDescription>Бюджет новых заявок указывается в сомони (TJS). Код присваивается автоматически.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} noValidate>
            <FormAlert error={error} />
            <Field id="topic" label="Тема *" error={fieldErrors.topic} disabled={pending} maxLength={300} />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="plan_year" label="Год плана *" inputMode="numeric" defaultValue={String(defaultYear)} error={fieldErrors.plan_year} disabled={pending} />
              <Field id="participants_planned" label="Участников" inputMode="numeric" error={fieldErrors.participants_planned} disabled={pending} />
              <Field id="budget_amount" label="Бюджет, TJS" inputMode="decimal" error={fieldErrors.budget_amount} disabled={pending} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="format">Формат</Label>
                <Select id="format" name="format" defaultValue="" disabled={pending}>
                  <option value="">— не указан —</option>
                  {TRAINING_FORMAT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </div>
              <Field id="requester_raw" label="Инициатор" disabled={pending} />
            </div>
            <Field id="direction" label="Направление" disabled={pending} />
            <Field id="goal" label="Цель" disabled={pending} />
            <Field id="comment" label="Комментарий" disabled={pending} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Отмена</Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Создать заявку
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
