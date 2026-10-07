/**
 * Жизненный цикл мероприятия. Таблица переходов повторяет SQL-функцию training_transition_allowed
 * (supabase/migrations/20261007100000_phase3a1_01_learning_events.sql). При изменении БД правьте обе стороны.
 * Источник истины — БД: триггер блокирует недопустимый переход. UI лишь не предлагает его.
 * ADMIN может исправить любой переход, но обязательно с причиной.
 */
export const LIFECYCLE_STATUSES = ["DRAFT", "PLANNED", "APPROVED", "REGISTERED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "POSTPONED", "NOT_HELD"] as const;
export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const TRANSITIONS: Record<LifecycleStatus, readonly LifecycleStatus[]> = {
  DRAFT: ["PLANNED", "CANCELLED"],
  PLANNED: ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "POSTPONED", "NOT_HELD"],
  APPROVED: ["PLANNED", "REGISTERED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "POSTPONED"],
  REGISTERED: ["APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "POSTPONED"],
  IN_PROGRESS: ["PLANNED", "COMPLETED", "CANCELLED", "POSTPONED"],
  COMPLETED: ["IN_PROGRESS"],
  CANCELLED: ["DRAFT", "PLANNED"],
  POSTPONED: ["PLANNED", "APPROVED", "REGISTERED", "IN_PROGRESS", "CANCELLED", "NOT_HELD"],
  NOT_HELD: ["PLANNED", "POSTPONED"],
};

export function isLifecycleStatus(v: string): v is LifecycleStatus {
  return (LIFECYCLE_STATUSES as readonly string[]).includes(v);
}

/** Зеркало training_transition_allowed(from, to): тот же статус всегда допустим. */
export function transitionAllowed(from: string, to: string): boolean {
  if (from === to) return true;
  if (!isLifecycleStatus(from) || !isLifecycleStatus(to)) return false;
  return TRANSITIONS[from].includes(to);
}

/** Статусы, которые можно выбрать из текущего (без текущего). ADMIN видит все остальные. */
export function allowedNextStatuses(from: string, isAdmin: boolean): LifecycleStatus[] {
  if (!isLifecycleStatus(from)) return isAdmin ? [...LIFECYCLE_STATUSES] : [];
  if (isAdmin) return LIFECYCLE_STATUSES.filter((s) => s !== from);
  return [...TRANSITIONS[from]];
}

/** Обычный (не админский) переход разрешён таблицей; иначе это «исправление» администратора. */
export function isAdminOverride(from: string, to: string): boolean {
  return from !== to && !transitionAllowed(from, to);
}
