"use client";

import { Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/auth/form-parts";
import { setExamCost } from "@/app/(app)/exams/actions";
import { CURRENCIES } from "@/lib/workflows/schemas";
import { FUNDING_SOURCES, FUNDING_SOURCE_LABELS } from "@/lib/exams/format";
import { FieldBox, FormDialog } from "./form-dialog";

export type ExamCost = { fee: number; currency: string; fee_date: string; funding_source: string; note: string | null };

/** Стоимость экзамена. Курс и сумма в TJS считаются в БД по fx_rates; изменение существующей суммы — с причиной. */
export function ExamCostDialog({ examId, cost, defaultDate }: { examId: string; cost: ExamCost | null; defaultDate: string }) {
  return (
    <FormDialog
      testId="exam-cost-dialog"
      title="Стоимость экзамена"
      description="Сумма в сомони рассчитывается автоматически по курсу на дату оплаты."
      submitLabel="Сохранить"
      trigger={(open) => (
        <Button size="sm" variant="outline" onClick={open} data-testid="set-exam-cost">
          <Wallet aria-hidden="true" /> {cost ? "Изменить стоимость" : "Указать стоимость"}
        </Button>
      )}
      onSubmit={(fd) =>
        setExamCost({ exam_id: examId, fee: fd.get("fee"), currency: fd.get("currency"), fee_date: fd.get("fee_date"), funding_source: fd.get("funding_source"), note: fd.get("note"), reason: fd.get("reason") })
      }
    >
      {({ pending, errors }) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="fee" label="Сумма *" inputMode="decimal" defaultValue={cost?.fee ?? ""} error={errors.fee} disabled={pending} className="h-10" />
            <FieldBox id="currency" label="Валюта *" error={errors.currency}>
              <Select id="currency" name="currency" defaultValue={cost?.currency ?? "TJS"} disabled={pending} className="h-10">
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
            </FieldBox>
          </div>
          <Field id="fee_date" label="Дата оплаты" type="date" defaultValue={cost?.fee_date ?? defaultDate} error={errors.fee_date} disabled={pending} className="h-10" />
          <FieldBox id="funding_source" label="Источник финансирования *" error={errors.funding_source}>
            <Select id="funding_source" name="funding_source" defaultValue={cost?.funding_source ?? "COMPANY"} disabled={pending} className="h-10">
              {FUNDING_SOURCES.map((s) => (
                <option key={s} value={s}>{FUNDING_SOURCE_LABELS[s]}</option>
              ))}
            </Select>
          </FieldBox>
          <FieldBox id="note" label="Примечание" error={errors.note}>
            <Textarea id="note" name="note" rows={2} defaultValue={cost?.note ?? ""} disabled={pending} />
          </FieldBox>
          <FieldBox id="reason" label={cost ? "Причина изменения *" : "Причина (необязательно)"} error={errors.reason}>
            <Textarea id="reason" name="reason" rows={2} disabled={pending} />
          </FieldBox>
        </>
      )}
    </FormDialog>
  );
}
