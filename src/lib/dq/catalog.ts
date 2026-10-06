/**
 * Каталог действий Data Quality по коду правила. Каждая проблема должна, где возможно, давать действие:
 * Открыть / Исправить / Выбрать / Связать / Оставить на проверке (+ «Подтвердить как есть»).
 * «Исправить» ведёт в нужное место карточки, где поле редактируется inline; после правки проверка сама закрывает проблему.
 */
export type DqActionKind = "open" | "fix" | "choose" | "link-request" | "link-training" | "review" | "confirm";
export type DqAction = { kind: DqActionKind; label: string; href?: string };

export type DqIssueLite = { rule_code: string; entity_table: string | null; entity_id: string | null; details: Record<string, unknown> | null };

type Rule = { title: string; actions: (i: DqIssueLite) => DqAction[] };

const training = (i: DqIssueLite, tab?: string) => `/trainings/${i.entity_id}${tab ? `?tab=${tab}` : ""}`;
const review: DqAction = { kind: "review", label: "Оставить на проверке" };
const confirm: DqAction = { kind: "confirm", label: "Подтвердить как есть" };

export const DQ_RULES: Record<string, Rule> = {
  TRAINING_NO_PARTICIPANTS: {
    title: "Нет участников",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "choose", label: "Выбрать участников", href: training(i, "participants") }, review, confirm],
  },
  TRAINING_DONE_IN_FUTURE: {
    title: "Завершён, но дата в будущем",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Исправить дату или статус", href: training(i) }, review],
  },
  TRAINING_PLANNED_IN_PAST: {
    title: "Запланирован, но дата прошла",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Исправить статус", href: training(i) }, review],
  },
  TRAINING_HOURS_MISMATCH: {
    title: "Часы не равны сумме заходов",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Исправить заходы", href: training(i, "sessions") }, review],
  },
  PARTICIPANTS_PLAN_VS_FACT: {
    title: "План и факт по участникам расходятся",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Исправить участников", href: training(i, "participants") }, confirm, review],
  },
  SRC_PLANNED_NO_REQUEST: {
    title: "Плановый тренинг без заявки",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "link-request", label: "Связать с заявкой" }, review],
  },
  SRC_CANDIDATE_UNCONFIRMED: {
    title: "Внеплановый тренинг ждёт подтверждения",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "link-request", label: "Связать с заявкой" }, confirm, review],
  },
  REQUEST_NO_TRAINING: {
    title: "У заявки нет тренинга",
    actions: (i) => [{ kind: "open", label: "Открыть", href: `/trainings/requests/${i.entity_id}` }, { kind: "link-training", label: "Связать с тренингом" }, { kind: "fix", label: "Исправить статус заявки", href: `/trainings/requests/${i.entity_id}` }, review],
  },
  EMPLOYEE_DUPLICATE_NAME: {
    title: "Совпадающие ФИО в справочнике",
    actions: (i) => [{ kind: "open", label: "Открыть", href: `/employees/${i.entity_id}` }, review, confirm],
  },
  EMPLOYEE_NO_UNIT: {
    title: "У сотрудника нет подразделения",
    actions: (i) => [{ kind: "open", label: "Открыть", href: `/employees/${i.entity_id}` }, { kind: "fix", label: "Выбрать подразделение", href: `/employees/${i.entity_id}` }, review],
  },
};

const FALLBACK: Rule = { title: "Замечание", actions: () => [review, confirm] };

export function ruleTitle(code: string): string {
  return (DQ_RULES[code] ?? FALLBACK).title;
}

export function actionsFor(issue: DqIssueLite): DqAction[] {
  const rule = DQ_RULES[issue.rule_code] ?? FALLBACK;
  const list = rule.actions(issue);
  // без сущности ссылки вести некуда
  return issue.entity_id ? list : list.filter((a) => !a.href && a.kind !== "link-request" && a.kind !== "link-training");
}

/** План/факт, если правило их присылает (details.plan, details.fact). */
export function planFact(details: Record<string, unknown> | null): { plan: number; fact: number } | null {
  if (!details) return null;
  const plan = Number(details.plan);
  const fact = Number(details.fact);
  return Number.isFinite(plan) && Number.isFinite(fact) && details.plan !== null && details.fact !== null ? { plan, fact } : null;
}
