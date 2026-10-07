import { z } from "zod";
import { uuid } from "@/lib/workflows/schemas";
import { CERT_TYPES } from "./status";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Дата в формате ГГГГ-ММ-ДД" });
const optDate = z.preprocess((v) => (v === "" ? null : v), isoDate.nullish().transform((v) => v ?? null));
const optText = (max: number) => z.string().trim().max(max, { message: `Не длиннее ${max} символов` }).nullish().transform((v) => (v ? v : null));
const optUuid = z.preprocess((v) => (v === "" || v === undefined ? null : v), uuid.nullable());
const optSkill = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().positive().nullable());
const optReason = z.string().trim().max(500, { message: "Причина не длиннее 500 символов" }).nullish().transform((v) => (v ? v : null));

const fields = {
  name: z.string().trim().min(2, { message: "Введите название сертификата" }).max(300, { message: "Не длиннее 300 символов" }),
  cert_type: z.enum(CERT_TYPES, { message: "Выберите тип" }),
  issuing_organization: optText(300),
  provider_id: optUuid,
  issue_date: optDate,
  expiration_date: optDate,
  certificate_number: optText(120),
  skill_id: optSkill,
  notes: optText(1000),
};

const datesOk = (v: { issue_date?: string | null; expiration_date?: string | null }) => !v.issue_date || !v.expiration_date || v.expiration_date >= v.issue_date;
const datesMsg = { path: ["expiration_date"], message: "Срок действия раньше даты выдачи" };

export const createCertificateSchema = z.object({ employee_id: uuid, ...fields, exam_id: optUuid, training_id: optUuid }).refine(datesOk, datesMsg);
export type CreateCertificateInput = z.input<typeof createCertificateSchema>;

export const updateCertificateSchema = z.object({ id: uuid, ...fields, reason: optReason }).refine(datesOk, datesMsg);
export type UpdateCertificateInput = z.input<typeof updateCertificateSchema>;

export const revokeCertificateSchema = z.object({
  id: uuid,
  revoked: z.boolean(),
  reason: z.string().trim().min(3, { message: "Укажите причину (не короче 3 символов)" }).max(500, { message: "Причина не длиннее 500 символов" }),
});

/** update_certificate требует причину при смене дат выдачи/окончания (как RPC). */
export function certificateReasonRequired(
  before: { issue_date: string | null; expiration_date: string | null },
  after: { issue_date: string | null; expiration_date: string | null },
): boolean {
  return (before.issue_date ?? null) !== (after.issue_date ?? null) || (before.expiration_date ?? null) !== (after.expiration_date ?? null);
}
