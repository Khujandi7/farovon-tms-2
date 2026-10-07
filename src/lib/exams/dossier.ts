/** Чистая логика вкладок «Навыки» и «Цели развития» досье. */
export const GOAL_TYPES = ["TRAINING", "COURSE", "EXAM", "CERTIFICATE", "SKILL", "OTHER"] as const;
export type GoalType = (typeof GOAL_TYPES)[number];
export const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  TRAINING: "Тренинг",
  COURSE: "Курс",
  EXAM: "Экзамен",
  CERTIFICATE: "Сертификат",
  SKILL: "Навык",
  OTHER: "Другое",
};
export const GOAL_STATUSES = ["PLANNED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  PLANNED: "Запланирована",
  IN_PROGRESS: "В работе",
  COMPLETED: "Выполнена",
  CANCELLED: "Отменена",
};
export const SKILL_SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Вручную",
  EXAM: "Экзамен",
  CERTIFICATE: "Сертификат",
  EVENT: "Мероприятие",
  IMPORT: "Импорт",
};

export function goalStatusTone(status: string): "success" | "warning" | "outline" | "brand" {
  if (status === "COMPLETED") return "success";
  if (status === "IN_PROGRESS") return "brand";
  if (status === "CANCELLED") return "outline";
  return "warning";
}

type SkillEntry = { id: string; skill_id: number; achieved_on: string; created_at: string };

/** История уровней — append-only: актуальным считается последняя запись (achieved_on, затем created_at) по каждому навыку. */
export function currentSkillEntries<T extends SkillEntry>(rows: readonly T[]): T[] {
  const best = new Map<number, T>();
  for (const r of rows) {
    const cur = best.get(r.skill_id);
    if (!cur || r.achieved_on > cur.achieved_on || (r.achieved_on === cur.achieved_on && r.created_at > cur.created_at)) best.set(r.skill_id, r);
  }
  return [...best.values()];
}

/** Группы целей по годам плана: новые годы выше, внутри года — по сроку, без срока — в конце. */
export function groupGoalsByYear<T extends { plan_year: number; due_date: string | null; title: string }>(goals: readonly T[]): { year: number; goals: T[] }[] {
  const map = new Map<number, T[]>();
  for (const g of goals) map.set(g.plan_year, [...(map.get(g.plan_year) ?? []), g]);
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, list]) => ({
      year,
      goals: [...list].sort((a, b) => (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31") || a.title.localeCompare(b.title, "ru")),
    }));
}
