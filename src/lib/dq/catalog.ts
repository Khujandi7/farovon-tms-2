/**
 * Каталог действий Data Quality по коду правила. Каждая проблема даёт, где возможно, действия:
 * Открыть / Исправить / Сопоставить / Связать / Решить (dq_resolve «Подтвердить как есть») / Оставить на проверке.
 * Действие с href — ссылка на нужную страницу (карточка сотрудника, экзамен, соглашение, /imports/[job], вкладка тренинга);
 * без href — диалог или вызов dq_resolve в карточке проблемы. «Исправить» ведёт туда, где поле правится inline;
 * после правки проверка сама закрывает проблему.
 */
export type DqActionKind = "open" | "fix" | "match" | "link" | "choose" | "link-request" | "link-training" | "review" | "confirm";
export type DqAction = { kind: DqActionKind; label: string; href?: string };

export type DqIssueLite = { rule_code: string; entity_table: string | null; entity_id: string | null; details: Record<string, unknown> | null };

type Rule = { title: string; description: string; actions: (i: DqIssueLite) => DqAction[] };

const training = (i: DqIssueLite, tab?: string) => `/trainings/${i.entity_id}${tab ? `?tab=${tab}` : ""}`;
const review: DqAction = { kind: "review", label: "Оставить на проверке" };
const confirm: DqAction = { kind: "confirm", label: "Подтвердить как есть" };

const isId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{8,}$/i.test(v);
function detail(i: DqIssueLite, key: string): string | null {
  const v = i.details?.[key];
  return isId(v) ? v : null;
}
/** Сотрудник проблемы: из details.employee_id или сама сущность, если это сотрудник. */
function employeeId(i: DqIssueLite): string | null {
  return detail(i, "employee_id") ?? (i.entity_table === "employees" ? i.entity_id : null);
}
const dossier = (i: DqIssueLite, tab: string) => {
  const e = employeeId(i);
  return e ? `/employees/${e}?tab=${tab}` : undefined;
};
const exam = (i: DqIssueLite) => `/exams/${i.entity_id}`;
const agreement = (i: DqIssueLite) => `/funding/${i.entity_id}`;
const importJob = (i: DqIssueLite) => `/imports/${i.entity_id}`;

/** Список действий без тех, у кого ссылку построить не из чего (href: undefined у «ссылочных» действий). */
const list = (...a: (DqAction | null)[]): DqAction[] => a.filter((x): x is DqAction => x !== null);
const to = (kind: DqActionKind, label: string, href: string | undefined): DqAction | null => (href ? { kind, label, href } : null);

export const DQ_RULES: Record<string, Rule> = {
  TRAINING_NO_PARTICIPANTS: {
    title: "Нет участников",
    description: "Мероприятие идёт или проведено, но список участников пуст.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "choose", label: "Выбрать участников", href: training(i, "participants") }, review, confirm],
  },
  TRAINING_DONE_IN_FUTURE: {
    title: "Завершён, но дата в будущем",
    description: "Мероприятие помечено проведённым, а дата окончания ещё не наступила.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Исправить дату или статус", href: training(i) }, review],
  },
  TRAINING_PLANNED_IN_PAST: {
    title: "Запланирован, но дата прошла",
    description: "Статус «ещё не проведено», хотя дата окончания уже прошла.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Исправить статус", href: training(i) }, review],
  },
  TRAINING_HOURS_MISMATCH: {
    title: "Часы не равны сумме заходов",
    description: "Часы программы расходятся с суммой часов заходов.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Исправить заходы", href: training(i, "sessions") }, review],
  },
  PARTICIPANTS_PLAN_VS_FACT: {
    title: "План и факт по участникам расходятся",
    description: "Число участников заметно отличается от планового.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Исправить участников", href: training(i, "participants") }, confirm, review],
  },
  SRC_PLANNED_NO_REQUEST: {
    title: "Плановый тренинг без заявки",
    description: "Мероприятие считается плановым, но не связано ни с одной заявкой.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "link-request", label: "Связать с заявкой" }, review],
  },
  SRC_CANDIDATE_UNCONFIRMED: {
    title: "Внеплановый тренинг ждёт подтверждения",
    description: "Внеплановое мероприятие нужно подтвердить или связать с заявкой.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "link-request", label: "Связать с заявкой" }, confirm, review],
  },
  REQUEST_NO_TRAINING: {
    title: "У заявки нет тренинга",
    description: "Заявка в плане или выполнена, но мероприятия по ней нет.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: `/trainings/requests/${i.entity_id}` }, { kind: "link-training", label: "Связать с тренингом" }, { kind: "fix", label: "Исправить статус заявки", href: `/trainings/requests/${i.entity_id}` }, review],
  },
  EMPLOYEE_DUPLICATE_NAME: {
    title: "Совпадающие ФИО в справочнике",
    description: "В справочнике несколько сотрудников с одинаковым ФИО.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: `/employees/${i.entity_id}` }, review, confirm],
  },
  EMPLOYEE_NO_UNIT: {
    title: "У сотрудника нет подразделения",
    description: "Сотрудник не привязан к подразделению.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: `/employees/${i.entity_id}` }, { kind: "fix", label: "Выбрать подразделение", href: `/employees/${i.entity_id}` }, review],
  },

  // ---- Phase 3A.1: участники, сертификаты, экзамены ----
  PARTICIPANT_DUPLICATE_PERSON: {
    title: "Двое участников с одним ФИО",
    description: "В одном мероприятии два сотрудника с одинаковым ФИО: возможно, человек задвоен в справочнике.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Исправить участников", href: training(i, "participants") }, confirm, review],
  },
  CERT_EXPIRED: {
    title: "Сертификат истёк",
    description: "Срок действия сертификата вышел; отозванные и архивные не проверяются.",
    actions: (i) => list(to("open", "Открыть сертификат", dossier(i, "certificates") ?? "/certificates"), to("fix", "Продлить или обновить срок", dossier(i, "certificates")), review, confirm),
  },
  CERT_EXPIRING: {
    title: "Сертификат скоро истекает",
    description: "Срок действия сертификата истекает в ближайшие 30 дней.",
    actions: (i) => list(to("open", "Открыть сертификат", dossier(i, "certificates") ?? "/certificates"), to("fix", "Продлить или обновить срок", dossier(i, "certificates")), review, confirm),
  },
  EXAM_NO_RESULT: {
    title: "У экзамена нет результата",
    description: "Дата экзамена прошла, а результат не внесён.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: exam(i) }, { kind: "fix", label: "Внести результат", href: exam(i) }, review],
  },
  EXAM_PASSED_NO_CERT: {
    title: "Экзамен сдан, сертификата нет",
    description: "По сданному экзамену не добавлен сертификат.",
    actions: (i) => list({ kind: "open", label: "Открыть", href: exam(i) }, to("link", "Добавить сертификат", dossier(i, "certificates")), confirm, review),
  },

  // ---- финансирование и договоры ----
  FUNDING_NO_CONTRACT: {
    title: "Оплата компанией без договора",
    description: "Экзамен оплачен компанией, но нет договора или соглашения о финансировании.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: exam(i) }, { kind: "link", label: "Создать соглашение", href: `/funding/new?exam=${i.entity_id}` }, review],
  },
  AGREEMENT_NO_CONTRACT: {
    title: "В соглашении нет договора",
    description: "У соглашения нет ни файла договора, ни его номера.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: agreement(i) }, { kind: "fix", label: "Прикрепить договор", href: agreement(i) }, review],
  },
  EDU_FUNDED_NO_AGREEMENT: {
    title: "Индивидуальное обучение без соглашения",
    description: "Расходы компании на индивидуальное обучение есть, а соглашения о финансировании нет.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "link", label: "Создать соглашение", href: `/funding/new?training=${i.entity_id}` }, review],
  },
  FAILED_EXAM_NO_POLICY: {
    title: "Экзамен не сдан, политики нет",
    description: "Для расчёта обязательства нет подтверждённой политики или договора.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: exam(i) }, { kind: "link", label: "Создать соглашение", href: `/funding/new?exam=${i.entity_id}` }, { kind: "fix", label: "Выбрать политику", href: "/funding/policies" }, confirm, review],
  },
  AGREEMENT_NOT_EVALUATED: {
    title: "Соглашение не рассчитано",
    description: "Результат уже известен, а обязательство по политике ещё не рассчитано.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: agreement(i) }, { kind: "fix", label: "Выполнить расчёт", href: agreement(i) }, review],
  },
  OBLIGATION_NOT_REVIEWED: {
    title: "Обязательство не проверено",
    description: "Обязательство сотрудника создано и ждёт проверки ответственным.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: agreement(i) }, { kind: "fix", label: "Проверить обязательство", href: agreement(i) }, review],
  },
  CONTRACT_EXPIRING: {
    title: "Срок договора истекает",
    description: "Срок договора или соглашения истекает в ближайшие 30 дней.",
    actions: () => [{ kind: "open", label: "Открыть документы", href: "/documents" }, confirm, review],
  },
  EXPENSE_NO_FX: {
    title: "Расход без курса",
    description: "Расход в иностранной валюте без курса: сумма в сомони не рассчитана.",
    actions: (i) => {
      const t = detail(i, "training_id");
      return list(to("open", "Открыть расходы", t ? `/trainings/${t}?tab=expenses` : undefined), to("fix", "Внести курс", t ? `/trainings/${t}?tab=expenses` : undefined), review);
    },
  },

  // ---- импорт (source = IMPORT): entity — задание импорта ----
  IMPORT_EMPLOYEE_NOT_FOUND: {
    title: "Импорт: сотрудник не найден",
    description: "Строка файла не нашла сотрудника в справочнике. Сотрудник автоматически не создаётся.",
    actions: (i) => [{ kind: "open", label: "Открыть импорт", href: importJob(i) }, { kind: "match", label: "Сопоставить с сотрудником", href: importJob(i) }, review],
  },
  IMPORT_EMPLOYEE_AMBIGUOUS: {
    title: "Импорт: несколько сотрудников",
    description: "Строка файла подходит нескольким сотрудникам: нужно выбрать нужного.",
    actions: (i) => [{ kind: "open", label: "Открыть импорт", href: importJob(i) }, { kind: "match", label: "Выбрать сотрудника", href: importJob(i) }, review],
  },
  IMPORT_EMPLOYEE_FUZZY: {
    title: "Импорт: неточное совпадение",
    description: "Сотрудник найден по неточному написанию: подтвердите совпадение.",
    actions: (i) => [{ kind: "open", label: "Открыть импорт", href: importJob(i) }, { kind: "match", label: "Подтвердить сотрудника", href: importJob(i) }, review],
  },
  IMPORT_UNIT_UNKNOWN: {
    title: "Импорт: подразделение не найдено",
    description: "Названия подразделения из файла нет в справочнике ни как название, ни как псевдоним. В импорте можно создать подразделение или закрепить написание, после чего строка проверяется повторно.",
    actions: (i) => [{ kind: "open", label: "Открыть импорт", href: importJob(i) }, { kind: "link", label: "Подразделения и отделы", href: "/settings/references#units" }, review],
  },
  IMPORT_SKILL_UNKNOWN: {
    title: "Импорт: навык не найден",
    description: "Навыка из файла нет в справочнике навыков.",
    actions: (i) => [{ kind: "open", label: "Открыть импорт", href: importJob(i) }, { kind: "match", label: "Выбрать навык", href: importJob(i) }, review],
  },
  IMPORT_TYPE_UNKNOWN: {
    title: "Импорт: тип мероприятия не найден",
    description: "Типа из файла нет в справочнике типов мероприятий.",
    actions: (i) => [{ kind: "open", label: "Открыть импорт", href: importJob(i) }, { kind: "link", label: "Справочник типов", href: "/settings/references" }, review],
  },
  IMPORT_REVIEW: {
    title: "Импорт: строка требует решения",
    description: "Строка импорта требует решения: применить, сопоставить или пропустить.",
    actions: (i) => [{ kind: "open", label: "Открыть импорт", href: importJob(i) }, { kind: "match", label: "Разобрать строку", href: importJob(i) }, review],
  },

  // ---- Phase 3B: источники Google Sheets ----
  SOURCE_EMPLOYEE_MISSING: {
    title: "Сотрудника нет в источнике",
    description: "Сотрудник был в синхронизируемой Google-таблице, а при последней синхронизации его там нет. В TMS он не удалён.",
    actions: (i) => list(to("open", "Открыть сотрудника", i.entity_id ? `/employees/${i.entity_id}` : undefined), to("fix", "Источники", "/employees/import"), review, confirm),
  },
  // ---- Phase 3A.2: сквозные правила жизненного цикла ----
  TRAINING_NO_TRAINER: {
    title: "У обучения нет тренера",
    description: "Мероприятие идёт или проведено, а тренер не назначен: отчёты и обратная связь не смогут его учесть.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Назначить тренера", href: training(i, "trainers") }, review],
  },
  FEEDBACK_NO_TRAINING: {
    title: "Обратная связь без обучения",
    description: "Есть ответы анкет, но набор не привязан ни к одному обучению.",
    actions: () => [review],
  },
  FEEDBACK_NON_PARTICIPANT: {
    title: "Отзыв от не-участника",
    description: "Обратную связь по обучению дал сотрудник, которого нет среди участников.",
    actions: (i) => list(to("open", "Открыть обучение", i.details?.training_id ? `/trainings/${detail(i, "training_id")}?tab=participants` : undefined), review, confirm),
  },
  FEEDBACK_NO_INVITATION: {
    title: "Ответов больше, чем приглашений",
    description: "Есть ответы без приглашения участнику.",
    actions: (i) => list(to("open", "Открыть обратную связь", i.details?.training_id ? `/trainings/${detail(i, "training_id")}?tab=feedback` : undefined), review, confirm),
  },
  CERT_NOT_PARTICIPANT: {
    title: "Сертификат без участия в обучении",
    description: "Сертификат связан с обучением, где сотрудник не числится участником.",
    actions: (i) => list(to("open", "Открыть сертификат", dossier(i, "certificates")), to("fix", "Добавить в участники", i.details?.training_id ? `/trainings/${detail(i, "training_id")}?tab=participants` : undefined), review, confirm),
  },
  EXPENSE_ON_CANCELLED: {
    title: "Расходы по отменённому обучению",
    description: "У отменённого или несостоявшегося мероприятия есть расходы.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i) }, { kind: "fix", label: "Проверить расходы", href: training(i, "expenses") }, confirm, review],
  },
  SESSION_OUTSIDE_RANGE: {
    title: "Заход вне дат обучения",
    description: "Даты захода выходят за период мероприятия.",
    actions: (i) => list(to("open", "Открыть", i.details?.training_id ? `/trainings/${detail(i, "training_id")}?tab=sessions` : undefined), review),
  },
  ATTENDANCE_ON_CANCELLED_SESSION: {
    title: "Присутствие на отменённом заходе",
    description: "На отменённом заходе отмечены присутствующие: человеко-часы будут завышены.",
    actions: (i) => list(to("open", "Открыть посещаемость", i.details?.training_id ? `/trainings/${detail(i, "training_id")}?tab=attendance` : undefined), review),
  },
  PARTICIPANT_NO_SNAPSHOT: {
    title: "Нет снимка подразделения участника",
    description: "У участника не записано подразделение на момент обучения: аналитика по подразделениям его не учтёт.",
    actions: (i) => list(to("open", "Открыть обучение", i.details?.training_id ? `/trainings/${detail(i, "training_id")}?tab=participants` : undefined), review),
  },
  PARTICIPANT_NO_RESULT: {
    title: "У участников не указан результат",
    description: "Обучение завершено, но результат участников не отмечен.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i, "results") }, { kind: "fix", label: "Отметить результаты", href: training(i, "participants") }, confirm, review],
  },
  COMPLETED_NO_FEEDBACK_REQUEST: {
    title: "Обратная связь не запрашивалась",
    description: "Обучение проведено более недели назад, а анкеты участникам не отправлялись.",
    actions: (i) => [{ kind: "open", label: "Открыть", href: training(i, "feedback") }, confirm, review],
  },
};

const FALLBACK: Rule = { title: "Замечание", description: "Проверьте данные и примите решение.", actions: () => [review, confirm] };
/** Неизвестный код импорта (новое review_code в import_analyze_row) обрабатывается как общая строка импорта. */
const IMPORT_FALLBACK: Rule = { ...DQ_RULES.IMPORT_REVIEW!, title: "Импорт: строка требует решения" };

function ruleOf(code: string): Rule {
  return DQ_RULES[code] ?? (code.startsWith("IMPORT_") ? IMPORT_FALLBACK : FALLBACK);
}

export function ruleTitle(code: string): string {
  return ruleOf(code).title;
}

export function ruleDescription(code: string): string {
  return ruleOf(code).description;
}

export function actionsFor(issue: DqIssueLite): DqAction[] {
  const rule = ruleOf(issue.rule_code);
  const actions = rule.actions(issue);
  // без сущности ссылки вести некуда
  return issue.entity_id ? actions : actions.filter((a) => !a.href && a.kind !== "link-request" && a.kind !== "link-training" && a.kind !== "link" && a.kind !== "match");
}

/** План/факт, если правило их присылает (details.plan, details.fact). */
export function planFact(details: Record<string, unknown> | null): { plan: number; fact: number } | null {
  if (!details) return null;
  const plan = Number(details.plan);
  const fact = Number(details.fact);
  return Number.isFinite(plan) && Number.isFinite(fact) && details.plan !== null && details.fact !== null ? { plan, fact } : null;
}
