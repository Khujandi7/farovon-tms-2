"use client";

import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/auth/form-parts";
import { setExamResult } from "@/app/(app)/exams/actions";
import { EXAM_RESULTS, EXAM_RESULT_LABELS, examResultReasonRequired } from "@/lib/exams/format";
import { FieldBox, FormDialog } from "./form-dialog";

/** Результат и балл попытки. Первая отметка — без причины; изменение уже выставленного результата требует причину. */
export function ExamResultDialog({
  examId,
  current,
  variant = "outline",
}: {
  examId: string;
  current: { result: string; score: number | null; note: string | null };
  variant?: "outline" | "default";
}) {
  const [next, setNext] = useState(current.result);
  const needReason = examResultReasonRequired(current.result, next);
  return (
    <FormDialog
      testId="exam-result-dialog"
      title="Результат экзамена"
      description="Запись попытки не перезаписывается: результат и причина изменения сохраняются в журнале. Для пересдачи создайте новую попытку."
      submitLabel="Сохранить"
      trigger={(open) => (
        <Button size="sm" variant={variant} onClick={open} data-testid="set-exam-result">
          <ClipboardCheck aria-hidden="true" /> {current.result === "PENDING" ? "Внести результат" : "Изменить результат"}
        </Button>
      )}
      onSubmit={(fd) => setExamResult({ id: examId, result: fd.get("result"), score: fd.get("score"), note: fd.get("note"), reason: fd.get("reason") })}
    >
      {({ pending, errors }) => (
        <>
          <FieldBox id="result" label="Результат *" error={errors.result}>
            <Select id="result" name="result" value={next} onChange={(e) => setNext(e.target.value)} disabled={pending} className="h-10">
              {EXAM_RESULTS.map((r) => (
                <option key={r} value={r}>{EXAM_RESULT_LABELS[r]}</option>
              ))}
            </Select>
          </FieldBox>
          <Field id="score" label="Балл" inputMode="decimal" defaultValue={current.score ?? ""} error={errors.score} disabled={pending} className="h-10" />
          <FieldBox id="note" label="Комментарий к результату" error={errors.note}>
            <Textarea id="note" name="note" rows={2} defaultValue={current.note ?? ""} disabled={pending} />
          </FieldBox>
          <FieldBox id="reason" label={needReason ? "Причина изменения *" : "Причина (необязательно)"} error={errors.reason}>
            <Textarea id="reason" name="reason" rows={2} disabled={pending} placeholder="Например: апелляция, исправление ошибки ввода" />
          </FieldBox>
        </>
      )}
    </FormDialog>
  );
}
