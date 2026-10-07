/** Подписи и правила отображения экзаменов (чистая логика, без обращения к БД). */
export const EXAM_RESULTS = ["PENDING", "PASSED", "FAILED", "NOT_ATTENDED", "OTHER"] as const;
export type ExamResult = (typeof EXAM_RESULTS)[number];

export const EXAM_RESULT_LABELS: Record<ExamResult, string> = {
  PENDING: "Ожидается",
  PASSED: "Сдан",
  FAILED: "Не сдан",
  NOT_ATTENDED: "Не явился",
  OTHER: "Другое",
};

export const EXAM_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];
export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = {
  SCHEDULED: "Запланирован",
  COMPLETED: "Проведён",
  CANCELLED: "Отменён",
};

export const SKILL_KINDS = ["SKILL", "QUALIFICATION", "CERTIFICATION"] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];
export const SKILL_KIND_LABELS: Record<SkillKind, string> = { SKILL: "Навык", QUALIFICATION: "Квалификация", CERTIFICATION: "Сертификация" };

export const FUNDING_SOURCES = ["COMPANY", "EMPLOYEE", "SHARED", "EXTERNAL", "OTHER"] as const;
export type FundingSource = (typeof FUNDING_SOURCES)[number];
export const FUNDING_SOURCE_LABELS: Record<FundingSource, string> = {
  COMPANY: "Компания",
  EMPLOYEE: "Сотрудник",
  SHARED: "Совместно",
  EXTERNAL: "Внешний источник",
  OTHER: "Другое",
};

export type BadgeTone = "success" | "warning" | "outline" | "secondary" | "brand";

export function examResultLabel(result: string | null | undefined): string {
  return (EXAM_RESULT_LABELS as Record<string, string>)[result ?? ""] ?? "—";
}

export function examResultTone(result: string | null | undefined): BadgeTone {
  switch (result) {
    case "PASSED":
      return "success";
    case "FAILED":
      return "warning";
    case "PENDING":
      return "brand";
    default:
      return "outline";
  }
}

export function examStatusLabel(status: string | null | undefined): string {
  return (EXAM_STATUS_LABELS as Record<string, string>)[status ?? ""] ?? "—";
}

/** «Попытка 2». Номер задаёт БД, здесь только формат. */
export function formatAttempt(n: number | null | undefined): string {
  return n && n > 0 ? `Попытка ${n}` : "—";
}

/** Балл: целые без дробной части, иначе до 2 знаков, запятая как разделитель. */
export function formatScore(score: number | string | null | undefined): string {
  if (score === null || score === undefined || score === "") return "—";
  const n = Number(score);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

/**
 * Причина обязательна, когда уже выставленный результат (не «Ожидается») меняется на другой.
 * Повторяет set_exam_result: первая отметка результата — без причины.
 */
export function examResultReasonRequired(current: string | null | undefined, next: string): boolean {
  return !!current && current !== "PENDING" && current !== next;
}
