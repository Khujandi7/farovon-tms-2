"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/auth/form-parts";
import { addEmployeeSkill } from "@/app/(app)/exams/actions";
import { FieldBox, FormDialog } from "@/components/exams/form-dialog";
import type { SkillOption } from "@/components/exams/new-exam-dialog";

/** Добавляет запись в историю навыков (append-only): прежние уровни не меняются. */
export function AddSkillLevelDialog({ employeeId, skills, presetSkillId }: { employeeId: string; skills: SkillOption[]; presetSkillId?: number }) {
  return (
    <FormDialog
      testId="add-skill-dialog"
      title="Уровень навыка"
      description="Новая запись добавляется в историю; актуальным считается последний уровень. Прежние записи не меняются."
      submitLabel="Записать"
      trigger={(open) => (
        <Button size="sm" variant={presetSkillId ? "outline" : "default"} onClick={open} data-testid="add-skill">
          <Plus aria-hidden="true" /> {presetSkillId ? "Новый уровень" : "Добавить навык"}
        </Button>
      )}
      onSubmit={(fd) =>
        addEmployeeSkill({ employee_id: employeeId, skill_id: fd.get("skill_id"), level: fd.get("level"), achieved_on: fd.get("achieved_on"), note: fd.get("note"), reason: fd.get("reason") })
      }
    >
      {({ pending, errors }) => (
        <>
          <FieldBox id="skill_id" label="Навык / квалификация *" error={errors.skill_id}>
            <Select id="skill_id" name="skill_id" defaultValue={presetSkillId ?? ""} disabled={pending} className="h-10">
              <option value="">— выберите —</option>
              {skills.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </FieldBox>
          <Field id="level" label="Уровень *" placeholder="Например: Intermediate, B2, Passed" error={errors.level} disabled={pending} className="h-10" />
          <Field id="achieved_on" label="Дата достижения" type="date" error={errors.achieved_on} disabled={pending} className="h-10" />
          <FieldBox id="note" label="Примечание" error={errors.note}>
            <Textarea id="note" name="note" rows={2} disabled={pending} />
          </FieldBox>
          <FieldBox id="reason" label="Причина (необязательно)" error={errors.reason}>
            <Textarea id="reason" name="reason" rows={2} disabled={pending} />
          </FieldBox>
        </>
      )}
    </FormDialog>
  );
}
