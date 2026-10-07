import { z } from "zod";
import { CURRENCIES, reason, uuid } from "@/lib/workflows/schemas";
import { POLICY_OUTCOMES } from "./status";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Дата в формате ГГГГ-ММ-ДД" });
const optDate = z.preprocess((v) => (v === "" || v === undefined ? null : v), isoDate.nullable());
const optText = (max = 1000) =>
  z
    .string()
    .trim()
    .max(max, { message: `Не длиннее ${max} символов` })
    .nullish()
    .transform((v) => (v ? v : null));
const percent = z.coerce.number({ message: "Введите число" }).min(0, { message: "От 0 до 100" }).max(100, { message: "От 0 до 100" });
const money = z.coerce.number({ message: "Введите сумму" }).min(0, { message: "Сумма не меньше 0" }).max(1e12, { message: "Слишком большая сумма" });

export const POLICY_SCOPES = ["ANY", "EXAM", "INDIVIDUAL_EDUCATION"] as const;

/** Исходы политики: { PASSED: 0, FAILED: 100 } — доля ответственности сотрудника (в процентах от стоимости). */
export const outcomesSchema = z
  .record(z.string(), percent)
  .refine((o) => Object.keys(o).length > 0, { message: "Добавьте хотя бы один исход" })
  .refine((o) => Object.keys(o).every((k) => (POLICY_OUTCOMES as readonly string[]).includes(k)), { message: "Неизвестный исход" });

export const policySchema = z
  .object({
    name: z.string().trim().min(2, { message: "Введите название" }).max(200),
    scope: z.enum(POLICY_SCOPES).default("ANY"),
    company_coverage_percent: percent,
    currency: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(CURRENCIES).nullable()),
    effective_from: isoDate,
    effective_to: optDate,
    basis: optText(500),
    outcomes: outcomesSchema,
  })
  .refine((v) => !v.effective_to || v.effective_to >= v.effective_from, { path: ["effective_to"], message: "Окончание раньше начала" });
export type PolicyInput = z.input<typeof policySchema>;

export const createAgreementSchema = z
  .object({
    employee_id: uuid,
    training_id: z.preprocess((v) => (v === "" ? null : v), uuid.nullish().transform((v) => v ?? null)),
    exam_id: z.preprocess((v) => (v === "" ? null : v), uuid.nullish().transform((v) => v ?? null)),
    policy_id: z.preprocess((v) => (v === "" ? null : v), uuid.nullish().transform((v) => v ?? null)),
    total_cost: z.preprocess((v) => (v === "" || v === null ? undefined : v), money.optional()),
    currency: z.enum(CURRENCIES).default("TJS"),
    cost_date: z.preprocess((v) => (v === "" ? undefined : v), isoDate.optional()),
    company_coverage_percent: z.preprocess((v) => (v === "" || v === null ? undefined : v), percent.optional()),
    contract_number: optText(100),
    contract_date: optDate,
    contract_document_id: z.preprocess((v) => (v === "" ? null : v), uuid.nullish().transform((v) => v ?? null)),
    conditions: optText(2000),
    pass_condition: optText(1000),
    fail_condition: optText(1000),
    note: optText(1000),
  })
  .refine((v) => !!v.training_id || !!v.exam_id, { path: ["training_id"], message: "Выберите обучение или экзамен" })
  .refine((v) => !(v.training_id && v.exam_id), { path: ["exam_id"], message: "Выберите что-то одно: обучение или экзамен" })
  .refine((v) => v.total_cost !== undefined || !!v.exam_id, { path: ["total_cost"], message: "Укажите стоимость" })
  .refine((v) => v.company_coverage_percent !== undefined || !!v.policy_id, { path: ["company_coverage_percent"], message: "Укажите долю компании или выберите политику" });
export type CreateAgreementInput = z.input<typeof createAgreementSchema>;

/** Изменяемые поля соглашения (update_agreement). Условия после расчёта фиксируются БД. */
export const agreementPatchSchema = z
  .object({
    contract_document_id: z.preprocess((v) => (v === "" ? null : v), uuid.nullish().transform((v) => v ?? null)),
    contract_number: optText(100),
    contract_date: optDate,
    conditions: optText(2000),
    pass_condition: optText(1000),
    fail_condition: optText(1000),
    note: optText(1000),
    effective_from: optDate,
    effective_to: optDate,
  })
  .partial();

export const repaymentSchema = z.object({
  agreementId: uuid,
  amount: z.coerce.number({ message: "Введите сумму" }).positive({ message: "Сумма должна быть больше 0" }).max(1e12),
  paid_on: isoDate,
  comment: optText(500),
});

export const reviewSchema = z.object({ id: uuid, note: optText(1000), reason });
export const reasonOnlySchema = z.object({ id: uuid, reason });
export const evaluateSchema = z.object({ id: uuid, reason: z.string().trim().max(500).nullish().transform((v) => (v ? v : null)) });
