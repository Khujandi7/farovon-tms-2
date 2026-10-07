import type { AppRole } from "@/lib/auth/roles";
import { WF_ROLES } from "@/lib/workflows/roles";

export const EXPORT_ENTITIES = ["employees", "trainings", "exams", "certificates", "participants", "agreements"] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];
export const EXPORT_LIMIT = 20000;

export function isExportEntity(v: string): v is ExportEntity {
  return (EXPORT_ENTITIES as readonly string[]).includes(v);
}

export type ExportColumn = { key: string; header: string; width: number; money?: boolean; type?: "text" | "number" | "date" };

const t = (key: string, header: string, width = 20): ExportColumn => ({ key, header, width });
const n = (key: string, header: string, width = 12, money = false): ExportColumn => ({ key, header, width, type: "number", money });
const d = (key: string, header: string): ExportColumn => ({ key, header, width: 14, type: "date" });

export const EXPORT_COLUMNS: Record<ExportEntity, readonly ExportColumn[]> = {
  employees: [
    t("employee_code", "Табельный №", 14), t("canonical_id", "Код", 12), t("full_name", "ФИО", 34), t("position", "Должность", 28),
    t("department", "Департамент", 28), t("unit", "Отдел", 28), t("status", "Статус", 12), d("hire_date", "Дата приёма"), d("termination_date", "Дата увольнения"),
    n("events", "Мероприятий", 13), n("hours", "Часов", 10),
  ],
  trainings: [
    t("canonical_id", "Код", 12), t("title", "Название", 40), t("event_type", "Тип мероприятия", 24), t("status", "Статус", 16), t("source", "Источник", 14),
    t("format", "Формат", 12), d("start_date", "Начало"), d("end_date", "Окончание"), n("hours", "Часов", 9), n("participants", "Участников", 12), n("man_hours", "Человеко-часов", 15),
    t("organizer", "Организатор", 26), t("location", "Место", 24), n("actual_tjs", "Фактические затраты, TJS", 22, true),
  ],
  exams: [
    t("canonical_id", "Код", 12), t("employee", "Сотрудник", 32), t("employee_code", "Табельный №", 14), t("skill", "Навык", 28), d("exam_date", "Дата"), n("attempt_no", "Попытка", 9),
    t("result", "Результат", 14), n("score", "Балл", 8), t("provider", "Провайдер", 26), t("status", "Статус", 14),
    n("fee", "Стоимость", 12, true), { ...t("currency", "Валюта", 9), money: true }, n("fee_tjs", "Стоимость, TJS", 15, true), t("funding_source", "Источник финансирования", 22),
  ],
  certificates: [
    t("name", "Название", 36), t("cert_type", "Тип", 16), t("employee", "Сотрудник", 32), t("employee_code", "Табельный №", 14), t("certificate_number", "Номер", 18),
    t("issuing_organization", "Выдавшая организация", 28), d("issue_date", "Выдан"), d("expiration_date", "Действует до"), t("status", "Статус", 16), n("days_left", "Дней до окончания", 18),
  ],
  participants: [
    t("training", "Мероприятие", 40), t("training_code", "Код мероприятия", 16), t("employee", "Сотрудник", 32), t("employee_code", "Табельный №", 14),
    t("position", "Должность (на дату)", 28), t("department", "Департамент (на дату)", 28), t("unit", "Отдел (на дату)", 28), t("attended", "Присутствовал", 14), t("result", "Результат", 16), t("note", "Примечание", 30),
  ],
  agreements: [
    t("canonical_id", "Код", 12), t("employee", "Сотрудник", 32), t("employee_code", "Табельный №", 14), t("status", "Статус", 20), t("contract_number", "№ договора", 16), d("contract_date", "Дата договора"),
    n("total_cost", "Стоимость", 14, true), t("currency", "Валюта", 9), n("total_cost_tjs", "Стоимость, TJS", 15, true), n("company_coverage_percent", "Доля компании, %", 16, true),
    n("company_funded_amount", "Оплачено компанией", 18, true), n("repayment_amount", "К возврату", 14, true), t("outcome", "Исход", 16), d("effective_from", "Действует с"), d("effective_to", "Действует по"),
  ],
};

/** Кто может выгружать сущность вообще (повторяет доступ к данным по RLS). Соглашения — только ADMIN/ACADEMY_MANAGER/FINANCE. */
export function canExport(role: AppRole | null | undefined, entity: ExportEntity): boolean {
  if (!role) return false;
  if (entity === "agreements") return (WF_ROLES.fundingRead as readonly AppRole[]).includes(role);
  return true;
}

/**
 * Видит ли роль денежные колонки сущности. Трекинг затрат по тренингам видят роли с financialRead (ADMIN/ACADEMY_MANAGER/FINANCE/VIEWER),
 * стоимость экзаменов и соглашения — только fundingRead (ADMIN/ACADEMY_MANAGER/FINANCE). HR получает файл без денег. Это повтор RLS: БД всё равно вернёт пусто.
 */
export function canSeeMoney(role: AppRole | null | undefined, entity: ExportEntity): boolean {
  if (!role) return false;
  const roles: readonly AppRole[] = entity === "trainings" ? WF_ROLES.financialRead : WF_ROLES.fundingRead;
  return roles.includes(role);
}

export function columnsFor(entity: ExportEntity, role: AppRole | null | undefined): ExportColumn[] {
  const money = canSeeMoney(role, entity);
  return EXPORT_COLUMNS[entity].filter((c) => money || !c.money);
}

export function exportFileName(entity: ExportEntity, format: "csv" | "xlsx", now: Date = new Date()): string {
  return `farovon-${entity}-${now.toISOString().slice(0, 10)}.${format}`;
}
