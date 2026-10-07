"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { createIndividualEducation } from "@/app/(app)/trainings/actions";

/** «Добавить индивидуальное обучение»: мероприятие типа INDIVIDUAL_EDUCATION с одним участником. Расходы вносятся в карточке мероприятия. */
export function IndividualEducationDialog({ employeeId, employeeName, providers }: { employeeId: string; employeeName?: string; providers: { id: string; name: string }[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFieldErrors({});
    start(async () => {
      const r = await createIndividualEducation({
        employeeId,
        title: fd.get("title"),
        start_date: fd.get("start_date"),
        end_date: fd.get("end_date") || null,
        hours: fd.get("hours"),
        provider_id: fd.get("provider_id") || null,
        organizer: fd.get("organizer"),
        description: fd.get("description"),
      });
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        setOpen(false);
        router.refresh();
      } else {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="add-individual-education">
        <Plus aria-hidden="true" /> Добавить индивидуальное обучение
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto" data-testid="individual-education-dialog">
          <DialogHeader>
            <DialogTitle>Индивидуальное обучение</DialogTitle>
            <DialogDescription>
              {employeeName ? `Для сотрудника: ${employeeName}. ` : ""}Создаётся мероприятие типа «Индивидуальное обучение» с одним участником. Расходы вносятся в карточке мероприятия, во вкладке «Расходы».
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} noValidate>
            <FormAlert error={error} />
            <Field id="title" label="Название *" error={fieldErrors.title} disabled={pending} maxLength={300} autoComplete="off" />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="start_date" label="Начало *" type="date" error={fieldErrors.start_date} disabled={pending} />
              <Field id="end_date" label="Окончание" type="date" error={fieldErrors.end_date} disabled={pending} />
              <Field id="hours" label="Часы *" inputMode="decimal" error={fieldErrors.hours} disabled={pending} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="provider_id">Провайдер</Label>
                <Select id="provider_id" name="provider_id" defaultValue="" disabled={pending}>
                  <option value="">— не выбран —</option>
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <Field id="organizer" label="Организатор" disabled={pending} maxLength={300} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Описание</Label>
              <Textarea id="description" name="description" rows={3} disabled={pending} maxLength={2000} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Отмена</Button>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />} Добавить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
