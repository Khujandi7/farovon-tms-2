export const NOTIFICATION_TYPES = [
  "NEW_REQUEST",
  "DATA_QUALITY",
  "CERTIFICATE_EXPIRING",
  "EXAM_RESULT_REQUIRED",
  "CONTRACT_EXPIRING",
  "FUNDING_OBLIGATION",
  "IMPORT_CONFLICT",
  "TRAINING_REQUIRES_ACTION",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  NEW_REQUEST: "Новая заявка",
  DATA_QUALITY: "Качество данных",
  CERTIFICATE_EXPIRING: "Сертификат истекает",
  EXAM_RESULT_REQUIRED: "Нужен результат экзамена",
  CONTRACT_EXPIRING: "Срок договора",
  FUNDING_OBLIGATION: "Обязательство по финансированию",
  IMPORT_CONFLICT: "Импорт ждёт решений",
  TRAINING_REQUIRES_ACTION: "Мероприятие не закрыто",
};

export const SEVERITY_LABELS: Record<string, string> = { CRITICAL: "Критично", WARNING: "Важно", INFO: "К сведению" };

export function isNotificationType(v: unknown): v is NotificationType {
  return typeof v === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(v);
}

export function notificationTypeLabel(type: string): string {
  return isNotificationType(type) ? NOTIFICATION_TYPE_LABELS[type] : type;
}

/** Ссылка из БД допустима только если это внутренний путь (защита от открытого редиректа через данные). */
export function safeInternalHref(href: string | null | undefined): string | null {
  if (!href || !href.startsWith("/") || href.startsWith("//") || href.startsWith("/\\")) return null;
  return href;
}
