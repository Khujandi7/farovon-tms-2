import type { Database } from "@/types/database";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const APP_ROLES: readonly AppRole[] = ["ADMIN", "ACADEMY_MANAGER", "HR", "FINANCE", "VIEWER"] as const;

export const ROLE_LABELS: Record<AppRole, string> = {
  ADMIN: "Администратор",
  ACADEMY_MANAGER: "Менеджер академии",
  HR: "HR",
  FINANCE: "Финансы",
  VIEWER: "Наблюдатель",
};

export type SectionId =
  | "dashboard"
  | "trainings"
  | "employees"
  | "exams"
  | "funding"
  | "imports"
  | "budget"
  | "feedback"
  | "reports"
  | "data-quality"
  | "settings";

const ALL = APP_ROLES;

/**
 * Какие разделы показывать в интерфейсе. Это только удобство навигации: реальный доступ к строкам
 * определяют RLS-политики БД (0003_rls, Phase 1.5). Матрица повторяет их:
 *  - budget: чтение бюджета и расходов (fin_read) — ADMIN, ACADEMY_MANAGER, FINANCE, VIEWER;
 *  - data-quality: чтение dq_issues — ADMIN, ACADEMY_MANAGER, FINANCE, HR;
 *  - feedback: все роли, но HR/FINANCE/VIEWER видят только агрегаты (feedback_summary).
 */
export const SECTION_ACCESS: Record<SectionId, readonly AppRole[]> = {
  dashboard: ALL,
  trainings: ALL,
  employees: ALL,
  // Phase 3A.1: экзамены и сертификаты видят все (HR — без сумм); финансирование — только ответственные за деньги; импорт — те, кто вносит данные.
  exams: ALL,
  funding: ["ADMIN", "ACADEMY_MANAGER", "FINANCE"],
  imports: ["ADMIN", "ACADEMY_MANAGER", "HR", "FINANCE"],
  budget: ["ADMIN", "ACADEMY_MANAGER", "FINANCE", "VIEWER"],
  feedback: ALL,
  reports: ALL,
  "data-quality": ["ADMIN", "ACADEMY_MANAGER", "FINANCE", "HR"],
  settings: ALL,
};

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && (APP_ROLES as readonly string[]).includes(value);
}

export function canAccessSection(role: AppRole | null | undefined, section: SectionId): boolean {
  if (!role) return false;
  return SECTION_ACCESS[section].includes(role);
}

/** Право на запись — только для показа кнопок; запись всё равно проверяет RLS. */
export const WRITE_ACCESS = {
  trainings: ["ADMIN", "ACADEMY_MANAGER"],
  employees: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  budget: ["ADMIN", "FINANCE"],
  expenses: ["ADMIN", "ACADEMY_MANAGER", "FINANCE"],
  users: ["ADMIN"],
} as const satisfies Record<string, readonly AppRole[]>;

export function canWrite(role: AppRole | null | undefined, area: keyof typeof WRITE_ACCESS): boolean {
  if (!role) return false;
  return (WRITE_ACCESS[area] as readonly AppRole[]).includes(role);
}
