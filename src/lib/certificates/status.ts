/** Статусы сертификатов и расчёт «дней до истечения». Статус считает БД (v_certificates), здесь — только отображение. */
export const CERT_STATUSES = ["ACTIVE", "EXPIRED", "REVOKED", "NO_EXPIRATION"] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];
export const CERT_STATUS_LABELS: Record<CertStatus, string> = {
  ACTIVE: "Действует",
  EXPIRED: "Истёк",
  REVOKED: "Отозван",
  NO_EXPIRATION: "Бессрочный",
};

export const CERT_TYPES = ["TRAINING", "COURSE", "EXAM", "INTERNATIONAL", "DIPLOMA", "LICENSE"] as const;
export type CertType = (typeof CERT_TYPES)[number];
export const CERT_TYPE_LABELS: Record<CertType, string> = {
  TRAINING: "Тренинг",
  COURSE: "Курс",
  EXAM: "Экзамен",
  INTERNATIONAL: "Международный",
  DIPLOMA: "Диплом",
  LICENSE: "Лицензия",
};

/** Порог предупреждения — тот же, что в notify_scan (30 дней). */
export const EXPIRING_DAYS = 30;

export function certStatusLabel(status: string | null | undefined): string {
  return (CERT_STATUS_LABELS as Record<string, string>)[status ?? ""] ?? "—";
}
export function certTypeLabel(t: string | null | undefined): string {
  return (CERT_TYPE_LABELS as Record<string, string>)[t ?? ""] ?? "—";
}

const DAY = 86_400_000;
const toUtcDay = (iso: string): number => {
  const [y = 0, m = 1, d = 1] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Целых дней от `today` до даты истечения (отрицательно — просрочено). null — бессрочный/нет даты. */
export function daysUntil(expiration: string | null | undefined, today: Date = new Date()): number | null {
  if (!expiration || !/^\d{4}-\d{2}-\d{2}/.test(expiration)) return null;
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.round((toUtcDay(expiration) - t) / DAY);
}

function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
export const daysWord = (n: number) => `${n} ${plural(n, "день", "дня", "дней")}`;

export type ExpiryNote = { text: string; tone: "danger" | "warning" | "muted" } | null;

/** Пометка рядом со статусом: «Истекает через N дн.» / «Просрочен на N дн.». */
export function expiryNote(status: string | null | undefined, daysLeft: number | null | undefined): ExpiryNote {
  if (status === "REVOKED" || daysLeft === null || daysLeft === undefined) return null;
  if (daysLeft < 0) return { text: `Просрочен на ${daysWord(-daysLeft)}`, tone: "danger" };
  if (daysLeft === 0) return { text: "Истекает сегодня", tone: "warning" };
  if (daysLeft <= EXPIRING_DAYS) return { text: `Истекает через ${daysLeft} дн.`, tone: "warning" };
  return null;
}

export function isExpiringSoon(status: string | null | undefined, daysLeft: number | null | undefined, within = EXPIRING_DAYS): boolean {
  return status === "ACTIVE" && daysLeft !== null && daysLeft !== undefined && daysLeft >= 0 && daysLeft <= within;
}

export function certStatusTone(status: string | null | undefined): "success" | "warning" | "outline" | "secondary" {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "EXPIRED":
      return "warning";
    case "NO_EXPIRATION":
      return "secondary";
    default:
      return "outline";
  }
}
