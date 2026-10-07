import { z } from "zod";
import { CURRENCIES, reason, uuid } from "@/lib/workflows/schemas";
import { EXAM_RESULTS, FUNDING_SOURCES } from "./format";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Дата в формате ГГГГ-ММ-ДД" });
const optText = (max: number) =>
  z.string().trim().max(max, { message: `Не длиннее ${max} символов` }).nullish().transform((v) => (v ? v : null));
const optUuid = z.preprocess((v) => (v === "" || v === undefined ? null : v), uuid.nullable());
const skillId = z.coerce.number({ message: "Выберите значение" }).int({ message: "Выберите значение" }).positive({ message: "Выберите значение" });
const optReasonText = z.string().trim().max(500, { message: "Причина не длиннее 500 символов" }).nullish().transform((v) => (v ? v : null));

export const createExamSchema = z.object({
  employee_id: uuid,
  skill_id: skillId,
  provider_id: optUuid,
  exam_date: isoDate,
  comment: optText(1000),
});
export type CreateExamInput = z.input<typeof createExamSchema>;

export const examResultSchema = z.object({
  id: uuid,
  result: z.enum(EXAM_RESULTS, { message: "Выберите результат" }),
  score: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.number({ message: "Введите число" }).min(0, { message: "Не меньше 0" }).max(100000, { message: "Слишком большое значение" }).nullable(),
  ),
  note: optText(1000),
  reason: optReasonText,
});
export type ExamResultInput = z.input<typeof examResultSchema>;

export const examCostSchema = z.object({
  exam_id: uuid,
  fee: z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".").replace(/\s/g, "")) : v),
    z.number({ message: "Введите сумму" }).min(0, { message: "Не меньше 0" }).max(1_000_000_000, { message: "Слишком большая сумма" }),
  ),
  currency: z.enum(CURRENCIES, { message: "Выберите валюту" }),
  fee_date: z.preprocess((v) => (v === "" ? null : v), isoDate.nullish().transform((v) => v ?? null)),
  funding_source: z.enum(FUNDING_SOURCES, { message: "Выберите источник" }),
  note: optText(500),
  reason: optReasonText,
});
export type ExamCostInput = z.input<typeof examCostSchema>;

export const cancelExamSchema = z.object({ id: uuid, reason });
