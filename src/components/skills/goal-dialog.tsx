"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/auth/form-parts";
import { upsertGoal } from "@/app/(app)/exams/actions";
import { FieldBox, FormDialog } from "@/components/exams/form-dialog";
import type { SkillOption } from "@/components/exams/new-exam-dialog";
import { GOAL_STATUSES, GOAL_STATUS_LABELS, GOAL_TYPES, GOAL_TYPE_LABELS } from "@/lib/exams/dossier";

export type GoalRow = { id: string; plan_year: number; title: string; goal_type: string; status: string; due_date: string | null; skill_id: number | null; note: string | null };

/** Создание (без `goal`) или изменение цели плана развития, в том числе смена статуса. */
export function GoalDialog({ employeeId, goal, skills }: { employeeId: string; goal?: GoalRow; skills: SkillOption[] }) {
  return (
    <FormDialog
      wide
      testId="goal-dialog"
      title={goal ? "Изменить цель" : "Новая цель развития"}
      description="Цели собираются в план развития по годам. Изменения фиксируются в журнале."
      submitLabel={goal ? "Сохранить" : "Добавить"}
      trigger={(open) =>
        goal ? (
          <Button size="sm" variant="ghost" onClick={open} aria-label={`Изменить цель ${goal.title}`} data-testid="edit-goal">
            <Pencil aria-hidden="true" /> Изменить
          </Button>
        ) : (
          <Button size="sm" onClick={open} data-testid="new-goal">
            <Plus aria-hidden="true" /> Добавить цель
          </Button>
        )
      }
      onSubmit={(fd) =>
        upsertGoal({
          id: goal?.id ?? null,
          employee_id: employeeId,
          plan_year: fd.get("plan_year"),
          title: fd.get("title"),
          goal_type: fd.get("goal_type"),
          status: fd.get("status"),
          due_date: fd.get("due_date"),
          skill_id: fd.get("skill_id"),
          note: fd.get("note"),
          reason: fd.get("reason"),
        })
      }
    >
      {({ pending, errors }) => (
        <>
          <Field id="title" label="Цель *" defaultValue={goal?.title ?? ""} error={errors.title} disabled={pending} className="h-10" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="plan_year" label="Год плана *" inputMode="numeric" defaultValue={goal?.plan_year ?? new Date().getFullYear()} error={errors.plan_year} disabled={pending} className="h-10" />
            <Field id="due_date" label="Срок" type="date" defaultValue={goal?.due_date ?? ""} error={errors.due_date} disabled={pending} className="h-10" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox id="goal_type" label="Тип *" error={errors.goal_type}>
              <Select id="goal_type" name="goal_type" defaultValue={goal?.goal_type ?? "OTHER"} disabled={pending} className="h-10">
                {GOAL_TYPES.map((t) => (
                  <option key={t} value={t}>{GOAL_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </FieldBox>
            <FieldBox id="status" label="Статус *" error={errors.status}>
              <Select id="status" name="status" defaultValue={goal?.status ?? "PLANNED"} disabled={pending} className="h-10">
                {GOAL_STATUSES.map((t) => (
                  <option key={t} value={t}>{GOAL_STATUS_LABELS[t]}</option>
                ))}
              </Select>
            </FieldBox>
          </div>
          <FieldBox id="skill_id" label="Связанный навык">
            <Select id="skill_id" name="skill_id" defaultValue={goal?.skill_id ?? ""} disabled={pending} className="h-10">
              <option value="">— не указан —</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </FieldBox>
          <FieldBox id="note" label="Примечание" error={errors.note}>
            <Textarea id="note" name="note" rows={2} defaultValue={goal?.note ?? ""} disabled={pending} />
          </FieldBox>
          <FieldBox id="reason" label="Причина изменения (необязательно)" error={errors.reason}>
            <Textarea id="reason" name="reason" rows={2} disabled={pending} />
          </FieldBox>
        </>
      )}
    </FormDialog>
  );
}
