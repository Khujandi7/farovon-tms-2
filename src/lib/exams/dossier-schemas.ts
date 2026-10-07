import { z } from "zod";
import { reason, uuid } from "@/lib/workflows/schemas";
import { GOAL_STATUSES, GOAL_TYPES } from "./dossier";
import { SKILL_KINDS } from "./format";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Дата в формате ГГГГ-ММ-ДД" });
const optDate = z.preprocess((v) => (v === "" ? null : v), isoDate.nullish().transform((v) => v ?? null));
const optText = (max: number) => z.string().trim().max(max, { message: `Не длиннее ${max} символов` }).nullish().transform((v) => (v ? v : null));
const skillId = z.coerce.number({ message: "Выберите значение" }).int({ message: "Выберите значение" }).positive({ message: "Выберите значение" });
const optSkill = z.preprocess((v) => (v === "" || v === undefined ? null : v), skillId.nullable());
const optReason = z.string().trim().max(500, { message: "Причина не длиннее 500 символов" }).nullish().transform((v) => (v ? v : null));

export const addEmployeeSkillSchema = z.object({
  employee_id: uuid,
  skill_id: skillId,
  level: z.string().trim().min(1, { message: "Укажите уровень" }).max(60, { message: "Не длиннее 60 символов" }),
  achieved_on: optDate,
  note: optText(500),
  reason: optReason,
});
export type AddEmployeeSkillInput = z.input<typeof addEmployeeSkillSchema>;

export const upsertSkillSchema = z.object({
  id: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().positive().nullable()),
  name: z.string().trim().min(2, { message: "Введите название" }).max(120, { message: "Не длиннее 120 символов" }),
  kind: z.enum(SKILL_KINDS, { message: "Выберите тип" }),
  is_active: z.boolean().optional(),
});
export type UpsertSkillInput = z.input<typeof upsertSkillSchema>;

export const upsertGoalSchema = z.object({
  id: uuid.nullish().transform((v) => v ?? null),
  employee_id: uuid,
  plan_year: z.coerce.number({ message: "Введите год" }).int().min(2000, { message: "Год от 2000" }).max(2100, { message: "Год до 2100" }),
  title: z.string().trim().min(2, { message: "Опишите цель" }).max(300, { message: "Не длиннее 300 символов" }),
  goal_type: z.enum(GOAL_TYPES, { message: "Выберите тип" }),
  status: z.enum(GOAL_STATUSES, { message: "Выберите статус" }),
  due_date: optDate,
  skill_id: optSkill,
  note: optText(1000),
  reason: optReason,
});
export type UpsertGoalInput = z.input<typeof upsertGoalSchema>;
export { reason };
