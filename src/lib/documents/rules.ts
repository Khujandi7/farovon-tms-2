import type { AppRole } from "@/lib/auth/roles";

/** Ограничения бакета tms-documents (см. миграцию 20261007100200): 20 МБ, pdf/png/jpg/docx/xlsx/csv. */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const SIGNED_URL_TTL_SECONDS = 60;
export const BUCKET = "tms-documents";

export const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": "PDF",
  "image/png": "PNG",
  "image/jpeg": "JPG",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
  "text/csv": "CSV",
};
const EXT_TO_MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
};
export const ACCEPT_ATTR = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv";
export const ALLOWED_TYPES_HINT = "PDF, PNG, JPG, DOCX, XLSX, CSV; до 20 МБ";

export const DOC_TYPES = ["CONTRACT", "CERTIFICATE", "DIPLOMA", "INVOICE", "ACT", "PAYMENT_DOCUMENT", "EXAM_RESULT", "APPLICATION", "AGREEMENT", "OTHER"] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  CONTRACT: "Договор",
  CERTIFICATE: "Сертификат",
  DIPLOMA: "Диплом",
  INVOICE: "Счёт",
  ACT: "Акт",
  PAYMENT_DOCUMENT: "Платёжный документ",
  EXAM_RESULT: "Результат экзамена",
  APPLICATION: "Заявление",
  AGREEMENT: "Соглашение",
  OTHER: "Другое",
};
export const docTypeLabel = (t: string): string => (DOC_TYPES as readonly string[]).includes(t) ? DOC_TYPE_LABELS[t as DocType] : t;
export const isDocType = (v: unknown): v is DocType => typeof v === "string" && (DOC_TYPES as readonly string[]).includes(v);

/** Повторяет doc_is_financial() в БД. */
export function isFinancialDocType(t: string): boolean {
  return ["CONTRACT", "INVOICE", "ACT", "PAYMENT_DOCUMENT", "AGREEMENT"].includes(t);
}

/** Повторяет can_doc(type, write) в БД: финансовые — ADMIN/ACADEMY_MANAGER/FINANCE; остальные — чтение ADMIN/AM/HR/FINANCE, запись ADMIN/AM/HR. */
export function canDoc(role: AppRole | null | undefined, type: string, write: boolean): boolean {
  if (!role) return false;
  if (isFinancialDocType(type)) return role === "ADMIN" || role === "ACADEMY_MANAGER" || role === "FINANCE";
  if (write) return role === "ADMIN" || role === "ACADEMY_MANAGER" || role === "HR";
  return role === "ADMIN" || role === "ACADEMY_MANAGER" || role === "HR" || role === "FINANCE";
}

/** Типы документов, доступные роли для чтения / записи, с учётом ограничения `only`. */
export function visibleDocTypes(role: AppRole | null | undefined, only?: readonly DocType[]): DocType[] {
  return DOC_TYPES.filter((t) => (!only || only.includes(t)) && canDoc(role, t, false));
}
export function writableDocTypes(role: AppRole | null | undefined, only?: readonly DocType[]): DocType[] {
  return DOC_TYPES.filter((t) => (!only || only.includes(t)) && canDoc(role, t, true));
}

export type UiDocStatus = "PENDING" | "ACTIVE" | "ARCHIVED";
export const DOC_STATUS_LABELS: Record<UiDocStatus, string> = { PENDING: "Ожидает загрузки", ACTIVE: "Действует", ARCHIVED: "В архиве" };

/** Статус для интерфейса: в БД PENDING/UPLOADED плюс archived_at. */
export function documentUiStatus(d: { status: string; archived_at: string | null }): UiDocStatus {
  if (d.archived_at) return "ARCHIVED";
  return d.status === "UPLOADED" ? "ACTIVE" : "PENDING";
}

export function isExpired(expiresOn: string | null | undefined, today: Date = new Date()): boolean {
  if (!expiresOn) return false;
  return expiresOn < today.toISOString().slice(0, 10);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function extensionOf(name: string): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(name.trim());
  return m?.[1] ? m[1].toLowerCase() : "";
}

/** Браузер часто не знает MIME (CSV, DOCX): тогда берём по расширению. Явный чужой MIME не подменяем. */
export function resolveMime(name: string, browserType: string | null | undefined): string | null {
  const t = (browserType ?? "").toLowerCase();
  if (t && t in ALLOWED_MIME) return t;
  if (t && t !== "application/octet-stream" && t !== "application/vnd.ms-excel" && t !== "text/plain") return null;
  return EXT_TO_MIME[extensionOf(name)] ?? null;
}

export type FileCheck = { ok: true; mime: string } | { ok: false; error: string };

/** Проверка файла (клиент и сервер): размер, тип, расширение должно соответствовать MIME. */
export function validateFile(file: { name: string; size: number; type?: string | null }): FileCheck {
  if (!file.name || !file.name.trim()) return { ok: false, error: "У файла нет имени." };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: "Файл пустой." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "Файл больше 20 МБ." };
  const mime = resolveMime(file.name, file.type);
  if (!mime) return { ok: false, error: "Тип файла не поддерживается (PDF, PNG, JPG, DOCX, XLSX, CSV)." };
  const ext = extensionOf(file.name);
  if (!ext || EXT_TO_MIME[ext] !== mime) return { ok: false, error: "Расширение файла не соответствует его типу." };
  return { ok: true, mime };
}

export type DocScope = { employeeId?: string; trainingId?: string; examId?: string; requestId?: string; agreementId?: string; certificateId?: string };

export const SCOPE_COLUMNS: Record<keyof DocScope, string> = {
  employeeId: "employee_id",
  trainingId: "training_id",
  examId: "exam_id",
  requestId: "request_id",
  agreementId: "agreement_id",
  certificateId: "certificate_id",
};

export function scopeIsEmpty(scope: DocScope): boolean {
  return (Object.keys(SCOPE_COLUMNS) as (keyof DocScope)[]).every((k) => !scope[k]);
}
