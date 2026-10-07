import type { Database } from "@/types/database";

type Enums = Database["public"]["Enums"];

export const TRAINING_STATUS_LABELS: Record<Enums["training_status"], string> = {
  DRAFT: "Черновик",
  PLANNED: "Запланировано",
  APPROVED: "Согласовано",
  REGISTERED: "Регистрация открыта",
  IN_PROGRESS: "Идёт",
  COMPLETED: "Проведено",
  CANCELLED: "Отменено",
  POSTPONED: "Перенесено",
  NOT_HELD: "Не проведено",
};

export const TRAINING_STATUS_VARIANT: Record<Enums["training_status"], "success" | "brand" | "secondary" | "warning" | "outline"> = {
  DRAFT: "outline",
  PLANNED: "secondary",
  APPROVED: "brand",
  REGISTERED: "brand",
  IN_PROGRESS: "brand",
  COMPLETED: "success",
  CANCELLED: "outline",
  POSTPONED: "warning",
  NOT_HELD: "outline",
};

export const SOURCE_TYPE_LABELS: Record<Enums["source_type"], string> = {
  PLANNED: "Плановое",
  UNPLANNED: "Внеплановое",
};

export const TRAINING_FORMAT_LABELS: Record<Enums["training_format"], string> = {
  ONLINE: "Онлайн",
  OFFLINE: "Очно",
  BLENDED: "Смешанный",
};

export const TRAINING_KIND_LABELS: Record<Enums["training_kind"], string> = {
  INTERNAL: "Внутреннее",
  EXTERNAL: "Внешнее",
  UNSPECIFIED: "Не указано",
};

export const REQUEST_STATUS_LABELS: Record<Enums["request_status"], string> = {
  NEW: "Новая",
  REVIEW: "На рассмотрении",
  APPROVED: "Одобрена",
  REJECTED: "Отклонена",
  PLANNED: "В плане",
  DONE: "Выполнена",
  CARRIED_FORWARD: "Перенесена",
};

export const REQUEST_STATUS_VARIANT: Record<Enums["request_status"], "success" | "brand" | "secondary" | "warning" | "outline"> = {
  NEW: "secondary",
  REVIEW: "warning",
  APPROVED: "brand",
  REJECTED: "outline",
  PLANNED: "brand",
  DONE: "success",
  CARRIED_FORWARD: "warning",
};

export const UNPLANNED_REASON_LABELS: Record<Enums["unplanned_reason"], string> = {
  URGENT_BUSINESS_NEED: "Срочная потребность бизнеса",
  MANAGEMENT_REQUEST: "Поручение руководства",
  LEGAL_REQUIREMENT: "Требование законодательства",
  NEW_PROJECT: "Новый проект",
  EMPLOYEE_NEED: "Потребность сотрудника",
  EXTERNAL_OPPORTUNITY: "Внешняя возможность",
  OTHER: "Другое",
};

export const ATTENDANCE_LABELS: Record<Enums["attendance_status"], string> = {
  PRESENT: "Присутствовал",
  ABSENT: "Отсутствовал",
  EXCUSED: "Уважительная причина",
};

export const DQ_SEVERITY_LABELS: Record<Enums["dq_severity"], string> = {
  CRITICAL: "Критично",
  ERROR: "Ошибка",
  WARNING: "Предупреждение",
  INFO: "Сведения",
};

export const DQ_SEVERITY_VARIANT: Record<Enums["dq_severity"], "success" | "brand" | "secondary" | "warning" | "outline" | "default"> = {
  CRITICAL: "default",
  ERROR: "brand",
  WARNING: "warning",
  INFO: "secondary",
};

export const DQ_STATUS_LABELS: Record<string, string> = {
  OPEN: "Открыто",
  IN_REVIEW: "На проверке",
  CONFIRMED_OK: "Подтверждено как есть",
  FIXED: "Исправлено",
  IGNORED: "Игнорируется",
};

export const AUDIT_TABLE_LABELS: Record<string, string> = {
  trainings: "Тренинг",
  training_sessions: "Заход",
  training_participants: "Участник",
  session_attendance: "Посещаемость",
  expense_operations: "Расход",
  training_requests: "Заявка",
  employees: "Сотрудник",
  employee_aliases: "Написание ФИО",
  training_trainers: "Тренер тренинга",
  exams: "Экзамен",
  exam_costs: "Стоимость экзамена",
  certificates: "Сертификат",
  employee_skills: "Навык",
  development_goals: "Цель развития",
  skills: "Квалификация",
  documents: "Документ",
  learning_agreements: "Соглашение",
  funding_policies: "Политика финансирования",
  agreement_repayments: "Погашение",
  request_links: "Ссылка заявок",
  import_jobs: "Импорт",
  learning_event_types: "Тип мероприятия",
  learning_providers: "Провайдер",
};

export const FIELD_LABELS: Record<string, string> = {
  title: "Название",
  format: "Формат",
  kind: "Тип",
  location: "Место",
  hours: "Часы",
  start_date: "Начало",
  end_date: "Окончание",
  status: "Статус",
  source_type: "Источник",
  request_id: "Заявка",
  unplanned_reason: "Причина внепланового",
  comment: "Комментарий",
  description: "Описание",
  participants_planned: "Участников по плану",
  archived_at: "Архив",
  archive_reason: "Причина архива",
  amount: "Сумма",
  currency: "Валюта",
  amount_tjs: "Сумма, TJS",
  fx_rate: "Курс",
  operation_date: "Дата операции",
  category_id: "Статья",
  voided_at: "Сторно",
  void_reason: "Причина сторно",
  topic: "Тема",
  plan_year: "Год плана",
  budget_amount: "Бюджет",
  budget_currency: "Валюта бюджета",
  carry_forward: "Перенос",
  session_no: "№ захода",
  session_id: "Заход",
  attended: "Участвовал",
  employee_id: "Сотрудник",
  full_name: "ФИО",
  position: "Должность",
  is_active: "Активен",
  department_id: "Департамент",
  unit_id: "Отдел",
  event_type_id: "Тип мероприятия",
  provider_id: "Провайдер",
  organizer: "Организатор",
  result_summary: "Итог мероприятия",
  result: "Результат",
  result_note: "Примечание к результату",
  employee_code: "Табельный номер",
  hire_date: "Дата приёма",
  termination_date: "Дата увольнения",
  exam_date: "Дата экзамена",
  attempt_no: "Попытка",
  skill_id: "Квалификация",
  score: "Балл",
  cert_type: "Тип сертификата",
  certificate_number: "Номер сертификата",
  issue_date: "Дата выдачи",
  expiration_date: "Срок действия",
  issuing_organization: "Кем выдан",
  revoked_at: "Отозван",
  revoked_reason: "Причина отзыва",
  level: "Уровень",
  achieved_on: "Достигнут",
  goal_type: "Тип цели",
  due_date: "Срок",
  fee: "Стоимость",
  fee_tjs: "Стоимость, TJS",
  fee_date: "Дата оплаты",
  funding_source: "Источник оплаты",
  doc_type: "Тип документа",
  file_name: "Файл",
  expires_on: "Действует до",
  notes: "Заметки",
};

export const TRAINING_STATUS_OPTIONS = (Object.keys(TRAINING_STATUS_LABELS) as Enums["training_status"][]).map((v) => ({ value: v, label: TRAINING_STATUS_LABELS[v] }));
export const TRAINING_FORMAT_OPTIONS = (Object.keys(TRAINING_FORMAT_LABELS) as Enums["training_format"][]).map((v) => ({ value: v, label: TRAINING_FORMAT_LABELS[v] }));
export const TRAINING_KIND_OPTIONS = (Object.keys(TRAINING_KIND_LABELS) as Enums["training_kind"][]).map((v) => ({ value: v, label: TRAINING_KIND_LABELS[v] }));
export const REQUEST_STATUS_OPTIONS = (Object.keys(REQUEST_STATUS_LABELS) as Enums["request_status"][]).map((v) => ({ value: v, label: REQUEST_STATUS_LABELS[v] }));
export const UNPLANNED_REASON_OPTIONS = [{ value: "", label: "— не указана —" }, ...(Object.keys(UNPLANNED_REASON_LABELS) as Enums["unplanned_reason"][]).map((v) => ({ value: v, label: UNPLANNED_REASON_LABELS[v] }))];
