import type { AppRole } from "@/lib/auth/roles";

export const DOSSIER_TABS = [
  { id: "overview", label: "Обзор" },
  { id: "history", label: "История обучения" },
  { id: "events", label: "Мероприятия" },
  { id: "exams", label: "Экзамены" },
  { id: "certificates", label: "Сертификаты" },
  { id: "individual", label: "Индивидуальное обучение" },
  { id: "contracts", label: "Договоры" },
  { id: "documents", label: "Документы" },
  { id: "skills", label: "Навыки" },
  { id: "plan", label: "План развития" },
  { id: "costs", label: "Затраты" },
  { id: "timeline", label: "Хронология" },
  { id: "audit", label: "Аудит" },
] as const;

export type DossierTabId = (typeof DOSSIER_TABS)[number]["id"];

const MONEY_ROLES: readonly AppRole[] = ["ADMIN", "ACADEMY_MANAGER", "FINANCE"];

/** Какие вкладки видит роль. Повторяет RLS (договоры и затраты — только ответственные за деньги); защита — в RLS и RPC. */
export function visibleTabs(role: AppRole | null | undefined) {
  return DOSSIER_TABS.filter((t) => (t.id === "contracts" || t.id === "costs" ? !!role && MONEY_ROLES.includes(role) : true));
}

export function parseTab(value: string | string[] | undefined, role: AppRole | null | undefined): DossierTabId {
  const v = Array.isArray(value) ? value[0] : value;
  return visibleTabs(role).find((t) => t.id === v)?.id ?? "overview";
}

export const TIMELINE_KIND_LABELS: Record<string, string> = {
  EVENT: "Мероприятие",
  EXAM: "Экзамен",
  CERTIFICATE: "Сертификат",
  AGREEMENT: "Соглашение",
  SKILL: "Навык",
  GOAL: "Цель выполнена",
};

/** Ссылка на сущность хронологии (если у неё есть страница). */
export function timelineHref(refTable: string, refId: string, employeeId: string): string | null {
  switch (refTable) {
    case "trainings": return `/trainings/${refId}`;
    case "exams": return `/exams/${refId}`;
    case "learning_agreements": return `/funding/${refId}`;
    case "certificates": return `/employees/${employeeId}?tab=certificates`;
    case "employee_skills": return `/employees/${employeeId}?tab=skills`;
    case "development_goals": return `/employees/${employeeId}?tab=plan`;
    default: return null;
  }
}
