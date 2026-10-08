import type { AppRole } from "@/lib/auth/roles";

export const IMPORT_ENTITIES = ["EMPLOYEES", "LEARNING_EVENTS", "PARTICIPANTS", "EXPENSES", "EXAMS", "CERTIFICATES"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];
export type ImportSource = "XLSX" | "CSV" | "PASTE" | "GSHEET";

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  /** Обязательно хотя бы одно из группы (ФИО или табельный номер). */
  anyOf?: string;
  description: string;
  example: string;
  /** Синонимы заголовков колонок (RU/EN); сравниваются после нормализации. */
  synonyms: string[];
};

export type EntityDef = {
  entity: ImportEntity;
  slug: string;
  title: string;
  description: string;
  fields: ImportField[];
};

const person: ImportField[] = [
  {
    key: "full_name", label: "ФИО", anyOf: "person", description: "Полное имя сотрудника. Нужно ФИО или табельный номер.", example: "Иванов Иван Иванович",
    synonyms: ["фио", "ф и о", "сотрудник", "фамилия имя отчество", "фамилия и имя", "имя", "работник", "участник", "full name", "fullname", "name", "employee", "employee name"],
  },
  {
    key: "employee_code", label: "Табельный номер", anyOf: "person", description: "Табельный номер или код сотрудника; сопоставление по нему точнее, чем по ФИО.", example: "00123",
    synonyms: ["табельный номер", "табельный", "таб номер", "таб №", "таб", "код сотрудника", "код", "табельный №", "employee code", "employee id", "code", "personnel number", "tab no"],
  },
];

export const ENTITY_DEFS: Record<ImportEntity, EntityDef> = {
  EMPLOYEES: {
    entity: "EMPLOYEES", slug: "employees", title: "Сотрудники", description: "Справочник сотрудников: создание новых и обновление существующих.",
    fields: [
      ...person.map((f) => ({ ...f, anyOf: undefined, required: f.key === "full_name" })),
      { key: "position", label: "Должность", description: "Должность сотрудника.", example: "Бухгалтер", synonyms: ["должность", "позиция", "position", "job title", "title"] },
      { key: "department", label: "Подразделение", description: "Департамент; должен совпадать со справочником оргструктуры.", example: "Финансовый департамент", synonyms: ["подразделение", "департамент", "управление", "department", "division"] },
      { key: "unit", label: "Отдел", description: "Отдел внутри департамента.", example: "Бухгалтерия", synonyms: ["отдел", "служба", "unit", "section", "team"] },
      { key: "hire_date", label: "Дата приёма", description: "Дата приёма на работу (ГГГГ-ММ-ДД или ДД.ММ.ГГГГ).", example: "2021-03-15", synonyms: ["дата приема", "дата приёма", "принят", "дата найма", "hire date", "hired", "start date", "дата начала работы"] },
      { key: "termination_date", label: "Дата увольнения", description: "Дата увольнения, если есть.", example: "", synonyms: ["дата увольнения", "уволен", "termination date", "end date", "дата ухода"] },
      { key: "email", label: "Email", description: "Рабочая почта.", example: "ivanov@farovon.tj", synonyms: ["email", "e mail", "почта", "эл почта", "электронная почта", "mail"] },
      { key: "phone", label: "Телефон", description: "Рабочий телефон.", example: "+992 900 00 00 00", synonyms: ["телефон", "тел", "моб", "мобильный", "phone", "mobile", "tel"] },
      { key: "status", label: "Статус", description: "Активен / Уволен (да/нет, active/inactive).", example: "Активен", synonyms: ["статус", "активен", "активность", "status", "active"] },
    ],
  },
  LEARNING_EVENTS: {
    entity: "LEARNING_EVENTS", slug: "learning_events", title: "Мероприятия обучения", description: "Тренинги, курсы и другие мероприятия.",
    fields: [
      { key: "title", label: "Название", required: true, description: "Название мероприятия.", example: "Основы Excel", synonyms: ["название", "название тренинга", "тренинг", "название мероприятия", "мероприятие", "тема", "курс", "наименование", "title", "training", "training title", "event", "name"] },
      { key: "type", label: "Тип", description: "Тип мероприятия из справочника (код или название).", example: "Тренинг", synonyms: ["тип", "тип мероприятия", "вид", "вид обучения", "type", "event type"] },
      { key: "start_date", label: "Дата начала", required: true, description: "Дата начала (ГГГГ-ММ-ДД или ДД.ММ.ГГГГ).", example: "2026-10-20", synonyms: ["дата начала", "дата", "начало", "с", "start date", "start", "date", "дата проведения"] },
      { key: "end_date", label: "Дата окончания", description: "Дата окончания; если пусто — равна дате начала.", example: "2026-10-21", synonyms: ["дата окончания", "окончание", "конец", "по", "end date", "end", "дата завершения"] },
      { key: "hours", label: "Часы", required: true, description: "Длительность в академических часах (> 0).", example: "16", synonyms: ["часы", "часов", "кол во часов", "количество часов", "длительность", "продолжительность", "hours", "duration"] },
      { key: "format", label: "Формат", description: "ONLINE / OFFLINE / BLENDED (или Онлайн / Очно / Смешанный).", example: "Очно", synonyms: ["формат", "format", "форма проведения"] },
      { key: "location", label: "Место", description: "Место проведения.", example: "Худжанд, офис", synonyms: ["место", "место проведения", "локация", "location", "venue", "город"] },
      { key: "organizer", label: "Организатор / провайдер", description: "Организатор или провайдер обучения.", example: "Farovon Academy", synonyms: ["организатор", "провайдер", "поставщик", "организация", "organizer", "provider", "vendor"] },
    ],
  },
  PARTICIPANTS: {
    entity: "PARTICIPANTS", slug: "participants", title: "Участники", description: "Список участников мероприятия. Сотрудники не создаются: только сопоставление со справочником.",
    fields: [
      ...person,
      { key: "note", label: "Примечание", description: "Произвольная заметка.", example: "", synonyms: ["примечание", "заметка", "комментарий", "note", "comment", "notes"] },
    ],
  },
  EXPENSES: {
    entity: "EXPENSES", slug: "expenses", title: "Расходы", description: "Расходы по мероприятиям. Курс валюты должен быть заведён на дату расхода.",
    fields: [
      { key: "training", label: "Код мероприятия", required: true, description: "Код мероприятия вида TR-…", example: "TR-2026-0001", synonyms: ["код мероприятия", "мероприятие", "код тренинга", "тренинг", "название тренинга", "код", "training", "training code", "training id", "event", "tr"] },
      { key: "category", label: "Статья расходов", required: true, description: "Статья расходов из справочника.", example: "Аренда помещения", synonyms: ["статья", "статья расходов", "категория", "вид расхода", "category", "expense category", "item"] },
      { key: "amount", label: "Сумма", required: true, description: "Сумма (≥ 0), разделитель — точка или запятая.", example: "1500.50", synonyms: ["сумма", "стоимость", "amount", "sum", "cost", "total"] },
      { key: "currency", label: "Валюта", description: "TJS, USD, EUR, RUB, UZS, KZT. По умолчанию TJS.", example: "TJS", synonyms: ["валюта", "currency", "cur"] },
      { key: "date", label: "Дата", required: true, description: "Дата расхода.", example: "2026-10-05", synonyms: ["дата", "дата расхода", "дата оплаты", "date", "expense date", "payment date"] },
      { key: "comment", label: "Комментарий", description: "Пояснение к расходу.", example: "Счёт №12", synonyms: ["комментарий", "примечание", "описание", "comment", "note", "description"] },
    ],
  },
  EXAMS: {
    entity: "EXAMS", slug: "exams", title: "Экзамены", description: "Экзамены сотрудников и их результаты.",
    fields: [
      ...person,
      { key: "qualification", label: "Квалификация", required: true, description: "Название квалификации или сертификации. Нет в справочнике — потребуется решение.", example: "ACCA F1", synonyms: ["квалификация", "экзамен", "название экзамена", "сертификация", "название", "qualification", "exam", "certification", "skill"] },
      { key: "exam_date", label: "Дата экзамена", required: true, description: "Дата сдачи.", example: "2026-09-12", synonyms: ["дата экзамена", "дата сдачи", "дата", "exam date", "date"] },
      { key: "result", label: "Результат", description: "Сдан / Не сдан / Не явился (или PASSED / FAILED / NOT_ATTENDED); пусто — ожидается.", example: "Сдан", synonyms: ["результат", "итог", "исход", "result", "outcome", "status"] },
      { key: "score", label: "Балл", description: "Полученный балл.", example: "85", synonyms: ["балл", "баллы", "оценка", "score", "points", "mark", "grade"] },
      { key: "fee", label: "Стоимость", description: "Стоимость экзамена (вносится только ролям с доступом к финансам).", example: "120", synonyms: ["стоимость", "стоимость экзамена", "сумма", "взнос", "fee", "cost", "price", "amount"] },
      { key: "currency", label: "Валюта", description: "Валюта стоимости.", example: "USD", synonyms: ["валюта", "currency"] },
      { key: "funding_source", label: "Источник финансирования", description: "COMPANY / EMPLOYEE / SHARED / EXTERNAL / OTHER (или Компания / Сотрудник / Совместно / Внешний).", example: "Компания", synonyms: ["источник финансирования", "источник", "кто платит", "финансирование", "funding source", "funding", "payer"] },
    ],
  },
  CERTIFICATES: {
    entity: "CERTIFICATES", slug: "certificates", title: "Сертификаты", description: "Сертификаты и дипломы сотрудников.",
    fields: [
      ...person,
      { key: "name", label: "Название сертификата", required: true, description: "Название документа.", example: "Сертификат ACCA DipIFR", synonyms: ["название", "название сертификата", "сертификат", "документ", "наименование", "name", "certificate", "certificate name", "title"] },
      { key: "cert_type", label: "Тип", description: "TRAINING / COURSE / EXAM / INTERNATIONAL / DIPLOMA / LICENSE (или по-русски).", example: "Международный", synonyms: ["тип", "вид", "тип сертификата", "type", "cert type"] },
      { key: "issuing_organization", label: "Кем выдан", description: "Организация, выдавшая документ.", example: "ACCA", synonyms: ["кем выдан", "организация", "выдан", "орган выдачи", "провайдер", "issuer", "issuing organization", "organization", "provider"] },
      { key: "issue_date", label: "Дата выдачи", description: "Дата выдачи.", example: "2025-06-01", synonyms: ["дата выдачи", "выдан", "дата", "issue date", "issued", "date"] },
      { key: "expiration_date", label: "Действует до", description: "Дата окончания действия.", example: "2028-06-01", synonyms: ["действует до", "срок действия", "дата окончания", "годен до", "expiration date", "expires", "valid until", "expiry"] },
      { key: "certificate_number", label: "Номер", description: "Номер документа (по нему определяются дубли).", example: "A-12345", synonyms: ["номер", "номер сертификата", "№", "серия номер", "certificate number", "number", "no", "cert no"] },
    ],
  },
};

export function isImportEntity(v: unknown): v is ImportEntity {
  return typeof v === "string" && (IMPORT_ENTITIES as readonly string[]).includes(v);
}

export function entityFromSlug(slug: string | undefined | null): ImportEntity | null {
  const s = (slug ?? "").toLowerCase();
  const hit = IMPORT_ENTITIES.find((e) => ENTITY_DEFS[e].slug === s || e.toLowerCase() === s);
  return hit ?? null;
}

/** Повторяет can_import(entity) из миграции. */
export function canImportEntity(role: AppRole | null | undefined, entity: ImportEntity): boolean {
  if (!role) return false;
  if (role === "ADMIN") return true;
  if (entity === "LEARNING_EVENTS") return role === "ACADEMY_MANAGER";
  if (entity === "EXPENSES") return role === "ACADEMY_MANAGER" || role === "FINANCE";
  return role === "ACADEMY_MANAGER" || role === "HR";
}

export function importableEntities(role: AppRole | null | undefined): ImportEntity[] {
  return IMPORT_ENTITIES.filter((e) => canImportEntity(role, e));
}

export const ENTITY_LABELS: Record<ImportEntity, string> = Object.fromEntries(IMPORT_ENTITIES.map((e) => [e, ENTITY_DEFS[e].title])) as Record<ImportEntity, string>;

export const ROW_STATUS_LABELS: Record<string, string> = {
  NEW: "Новая", UPDATED: "Обновление", UNCHANGED: "Без изменений", DUPLICATE: "Дубль", NEEDS_REVIEW: "Требует решения", ERROR: "Ошибка",
};
export const JOB_STATUS_LABELS: Record<string, string> = { STAGED: "Ожидает применения", COMMITTED: "Применён", CANCELLED: "Отменён", FAILED: "Ошибка" };
export const SOURCE_LABELS: Record<string, string> = { XLSX: "Excel", CSV: "CSV", PASTE: "Вставка", GSHEET: "Google Sheets" };
