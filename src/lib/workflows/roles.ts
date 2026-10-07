import type { AppRole } from "@/lib/auth/roles";

/**
 * Кто может выполнять действия. Совпадает с проверками в RPC (req_role) и RLS-политиками; здесь — для кнопок и ранних отказов.
 */
export const WF_ROLES = {
  training: ["ADMIN", "ACADEMY_MANAGER"],
  request: ["ADMIN", "ACADEMY_MANAGER"],
  participants: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  attendance: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  expense: ["ADMIN", "ACADEMY_MANAGER", "FINANCE"],
  expenseVoid: ["ADMIN", "FINANCE"],
  employee: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  dq: ["ADMIN", "ACADEMY_MANAGER"],
  references: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  revert: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  eventType: ["ADMIN"],
  provider: ["ADMIN", "ACADEMY_MANAGER"],
  exam: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  examCost: ["ADMIN", "ACADEMY_MANAGER", "FINANCE"],
  certificate: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  skill: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  goal: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  document: ["ADMIN", "ACADEMY_MANAGER", "HR", "FINANCE"],
  fundingPolicy: ["ADMIN", "FINANCE"],
  agreement: ["ADMIN", "ACADEMY_MANAGER", "FINANCE"],
  agreementFinance: ["ADMIN", "FINANCE"],
  fundingRead: ["ADMIN", "ACADEMY_MANAGER", "FINANCE"],
  orgUnits: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  requestLinks: ["ADMIN"],
  importEmployees: ["ADMIN", "ACADEMY_MANAGER", "HR"],
  importAny: ["ADMIN", "ACADEMY_MANAGER", "HR", "FINANCE"],
  financialRead: ["ADMIN", "ACADEMY_MANAGER", "FINANCE", "VIEWER"],
} as const satisfies Record<string, readonly AppRole[]>;

export type WfArea = keyof typeof WF_ROLES;

export function can(role: AppRole | null | undefined, area: WfArea): boolean {
  return !!role && (WF_ROLES[area] as readonly AppRole[]).includes(role);
}

/** Откат таблицы аудита: какие роли могут откатывать записи каких таблиц (повторяет revert_change). */
export function canRevertTable(role: AppRole | null | undefined, table: string): boolean {
  if (!role) return false;
  if (["trainings", "training_sessions", "training_requests"].includes(table)) return role === "ADMIN" || role === "ACADEMY_MANAGER";
  if (["training_participants", "session_attendance"].includes(table)) return can(role, "attendance");
  return false;
}
