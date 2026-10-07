"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/auth/form-parts";
import { createExam } from "@/app/(app)/exams/actions";
import { EmployeePicker } from "./employee-picker";
import { FieldBox, FormDialog } from "./form-dialog";

export type SkillOption = { id: number; name: string; kind: string };
export type ProviderOption = { id: string; name: string };

/** Новая попытка экзамена. Если сотрудник известен (досье) — выбирать его не нужно. */
export function NewExamDialog({
  skills,
  providers,
  employee,
  size = "sm",
}: {
  skills: SkillOption[];
  providers: ProviderOption[];
  employee?: { id: string; name?: string };
  size?: "sm" | "default";
}) {
  return (
    <FormDialog
      testId="new-exam-dialog"
      title="Новый экзамен"
      description="Каждая попытка — отдельная запись: пересдача создаётся новой строкой, прежние результаты не меняются. Номер попытки присваивается автоматически."
      submitLabel="Добавить"
      trigger={(open) => (
        <Button size={size} onClick={open} data-testid="new-exam">
          <Plus aria-hidden="true" /> Новый экзамен
        </Button>
      )}
      onSubmit={(fd) =>
        createExam({
          employee_id: employee?.id ?? fd.get("employee_id"),
          skill_id: fd.get("skill_id"),
          provider_id: fd.get("provider_id"),
          exam_date: fd.get("exam_date"),
          comment: fd.get("comment"),
        })
      }
    >
      {({ pending, errors }) => (
        <>
          {employee ? (
            <p className="rounded-md bg-muted px-3 py-2 text-sm">Сотрудник: <span className="font-medium">{employee.name ?? "текущий сотрудник"}</span></p>
          ) : (
            <EmployeePicker error={errors.employee_id} disabled={pending} />
          )}
          <FieldBox id="skill_id" label="Квалификация / навык *" error={errors.skill_id}>
            <Select id="skill_id" name="skill_id" defaultValue="" disabled={pending} aria-invalid={errors.skill_id ? true : undefined} className="h-10">
              <option value="">— выберите —</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </FieldBox>
          <FieldBox id="provider_id" label="Провайдер">
            <Select id="provider_id" name="provider_id" defaultValue="" disabled={pending} className="h-10">
              <option value="">— не указан —</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </FieldBox>
          <Field id="exam_date" label="Дата экзамена *" type="date" error={errors.exam_date} disabled={pending} className="h-10" />
          <FieldBox id="comment" label="Примечание" error={errors.comment}>
            <Textarea id="comment" name="comment" rows={2} disabled={pending} />
          </FieldBox>
        </>
      )}
    </FormDialog>
  );
}
