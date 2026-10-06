import { z } from "zod";

/** Результат любого серверного действия: единый формат для форм и inline-редактирования. */
export type { ActionResult } from "@/lib/users/schemas";
export { fieldErrorsFrom } from "@/lib/users/schemas";

export const uuid = z.uuid({ message: "Неверный идентификатор" });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Дата в формате ГГГГ-ММ-ДД" });
const text = (max = 500) => z.string().trim().max(max, { message: `Не длиннее ${max} символов` });
const optText = (max = 500) => text(max).nullish().transform((v) => (v ? v : null));

/** Причина изменения. Обязательна для существенных изменений (деньги, статус, заявка, посещаемость, связи). */
export const reason = z.string().trim().min(3, { message: "Укажите причину (не короче 3 символов)" }).max(500, { message: "Причина не длиннее 500 символов" });
export const optReason = z.string().trim().max(500).nullish().transform((v) => (v ? v : null));

export const TRAINING_FORMATS = ["ONLINE", "OFFLINE", "BLENDED"] as const;
export const TRAINING_KINDS = ["INTERNAL", "EXTERNAL", "UNSPECIFIED"] as const;
export const TRAINING_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "POSTPONED", "NOT_HELD"] as const;
export const REQUEST_STATUSES = ["NEW", "REVIEW", "APPROVED", "REJECTED", "PLANNED", "DONE", "CARRIED_FORWARD"] as const;
export const UNPLANNED_REASONS = ["URGENT_BUSINESS_NEED", "MANAGEMENT_REQUEST", "LEGAL_REQUIREMENT", "NEW_PROJECT", "EMPLOYEE_NEED", "EXTERNAL_OPPORTUNITY", "OTHER"] as const;
export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "EXCUSED"] as const;
export const CURRENCIES = ["TJS", "USD", "EUR", "RUB", "UZS", "KZT"] as const;

const hours = z.coerce.number({ message: "Введите число" }).positive({ message: "Часы должны быть больше 0" }).max(10000);
const intOrNull = z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int({ message: "Целое число" }).min(0, { message: "Не меньше 0" }).nullable());

export const createTrainingSchema = z
  .object({
    title: text(300).min(2, { message: "Введите название" }),
    start_date: isoDate,
    end_date: isoDate.nullish().transform((v) => v || null),
    hours,
    format: z.enum(TRAINING_FORMATS).default("OFFLINE"),
    kind: z.enum(TRAINING_KINDS).default("UNSPECIFIED"),
    location: optText(300),
    request_id: uuid.nullish().transform((v) => v ?? null),
    unplanned_reason: z.enum(UNPLANNED_REASONS).nullish().transform((v) => v ?? null),
    participants_planned: intOrNull,
    description: optText(2000),
    comment: optText(1000),
  })
  .refine((v) => !v.end_date || v.end_date >= v.start_date, { path: ["end_date"], message: "Окончание раньше начала" });
export type CreateTrainingInput = z.input<typeof createTrainingSchema>;

/** Разрешённые для inline-редактирования поля тренинга и их валидация. */
export const TRAINING_FIELDS = {
  title: text(300).min(2, { message: "Введите название" }),
  format: z.enum(TRAINING_FORMATS),
  kind: z.enum(TRAINING_KINDS),
  location: optText(300),
  hours,
  start_date: isoDate,
  end_date: isoDate,
  status: z.enum(TRAINING_STATUSES),
  unplanned_reason: z.enum(UNPLANNED_REASONS).nullish().transform((v) => v ?? null),
  comment: optText(1000),
  description: optText(2000),
  participants_planned: intOrNull,
} as const;
export type TrainingField = keyof typeof TRAINING_FIELDS;
export const TRAINING_REASON_REQUIRED: readonly TrainingField[] = ["status", "hours", "start_date", "end_date"];

export const REQUEST_FIELDS = {
  topic: text(300).min(2, { message: "Введите тему" }),
  plan_year: z.coerce.number().int().min(2000).max(2100),
  request_date: isoDate.nullish().transform((v) => v || null),
  direction: optText(200),
  goal: optText(1000),
  participants_planned: intOrNull,
  format: z.enum(TRAINING_FORMATS).nullish().transform((v) => v ?? null),
  kind: z.enum(TRAINING_KINDS),
  trainer_raw: optText(200),
  requester_raw: optText(200),
  budget_amount: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().min(0, { message: "Не меньше 0" }).nullable()),
  period_raw: optText(200),
  status: z.enum(REQUEST_STATUSES),
  comment: optText(1000),
  carry_forward: z.coerce.boolean(),
  planned_year: intOrNull,
  department_id: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().positive().nullable()),
  unit_id: z.preprocess((v) => (v === "" || v === null || v === undefined ? null : v), z.coerce.number().int().positive().nullable()),
} as const;
export type RequestField = keyof typeof REQUEST_FIELDS;
export const REQUEST_REASON_REQUIRED: readonly RequestField[] = ["status", "budget_amount", "carry_forward"];

export const createRequestSchema = z.object({
  plan_year: REQUEST_FIELDS.plan_year,
  topic: REQUEST_FIELDS.topic,
  request_date: REQUEST_FIELDS.request_date,
  direction: REQUEST_FIELDS.direction,
  goal: REQUEST_FIELDS.goal,
  participants_planned: REQUEST_FIELDS.participants_planned,
  format: REQUEST_FIELDS.format,
  budget_amount: REQUEST_FIELDS.budget_amount,
  requester_raw: REQUEST_FIELDS.requester_raw,
  comment: REQUEST_FIELDS.comment,
});

export const EMPLOYEE_FIELDS = {
  full_name: text(200).min(2, { message: "Введите ФИО" }),
  position: optText(200),
  department_id: REQUEST_FIELDS.department_id,
  unit_id: REQUEST_FIELDS.unit_id,
  is_active: z.coerce.boolean(),
} as const;
export type EmployeeField = keyof typeof EMPLOYEE_FIELDS;

export const sessionSchema = z
  .object({
    start_date: isoDate,
    end_date: isoDate,
    hours,
    location: optText(300),
    comment: optText(1000),
  })
  .refine((v) => v.end_date >= v.start_date, { path: ["end_date"], message: "Окончание раньше начала" });

export const expenseSchema = z.object({
  category_id: z.coerce.number().int().positive({ message: "Выберите статью" }),
  amount: z.coerce.number({ message: "Введите сумму" }).min(0, { message: "Сумма не меньше 0" }).max(1e12),
  currency: z.enum(CURRENCIES),
  operation_date: isoDate,
  comment: optText(500),
});

export const attendanceUpdatesSchema = z
  .array(z.object({ participant_id: uuid, session_id: uuid, status: z.enum(ATTENDANCE_STATUSES) }))
  .min(1, { message: "Нет изменений посещаемости" })
  .max(5000);

export const idSchema = z.object({ id: uuid });
