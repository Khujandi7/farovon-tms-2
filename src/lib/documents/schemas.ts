import { z } from "zod";
import { reason, uuid } from "@/lib/workflows/schemas";
import { DOC_TYPES, MAX_FILE_BYTES, validateFile } from "./rules";

const optId = z.preprocess((v) => (v === "" || v === null ? undefined : v), uuid.optional());

export const scopeSchema = z
  .object({ employeeId: optId, trainingId: optId, examId: optId, requestId: optId, agreementId: optId, certificateId: optId })
  .refine((s) => Object.values(s).some(Boolean), { message: "Документ нужно связать с сотрудником, мероприятием, экзаменом, заявкой, соглашением или сертификатом" });

export const registerDocumentSchema = z
  .object({
    doc_type: z.enum(DOC_TYPES, { message: "Выберите тип документа" }),
    title: z.string().trim().min(2, { message: "Введите название документа" }).max(300, { message: "Не длиннее 300 символов" }),
    file_name: z.string().trim().min(1).max(300),
    mime_type: z.string().trim().min(1).max(200),
    size_bytes: z.coerce.number().int().positive().max(MAX_FILE_BYTES, { message: "Файл больше 20 МБ" }),
    expires_on: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Дата в формате ГГГГ-ММ-ДД" }).optional()),
    note: z.string().trim().max(1000).nullish().transform((v) => (v ? v : null)),
    scope: scopeSchema,
  })
  .superRefine((v, ctx) => {
    const check = validateFile({ name: v.file_name, size: v.size_bytes, type: v.mime_type });
    if (!check.ok) ctx.addIssue({ code: "custom", path: ["file"], message: check.error });
  });
export type RegisterDocumentInput = z.input<typeof registerDocumentSchema>;

export const archiveDocumentSchema = z.object({ id: uuid, archived: z.boolean(), reason });
export const documentIdSchema = z.object({ id: uuid });
