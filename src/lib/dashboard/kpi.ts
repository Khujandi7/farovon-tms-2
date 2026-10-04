import type { Database } from "@/types/database";
import { formatMoney, formatNumber, formatPercent } from "@/lib/format";

type KpiYearRaw = Database["public"]["Functions"]["kpi_year"]["Returns"][number];

/**
 * Генератор типов Supabase помечает поля функций как не-NULL, но kpi_year() намеренно возвращает NULL
 * (нет доступа к финансам, нет утверждённого плана, нет курса). Поэтому все поля, кроме financial_access, — nullable.
 */
export type KpiYearRow = {
  [K in keyof KpiYearRaw]: K extends "financial_access" ? KpiYearRaw[K] : KpiYearRaw[K] | null;
};

export type KpiCardState = "value" | "restricted" | "no_plan" | "no_fx";

export type KpiCardModel = {
  id: "actual" | "plan" | "variance" | "delivered" | "in_progress" | "unplanned" | "unplanned_actual";
  label: string;
  value: string;
  hint?: string;
  state: KpiCardState;
  financial: boolean;
};

/**
 * Превращает строку kpi_year() в карточки. Здесь НЕТ расчётов: только выбор готовых значений из БД,
 * форматирование и выбор состояния. NULL никогда не превращается в 0.
 * Определения A–E: docs/DECISIONS.md (D4).
 */
export function buildKpiCards(row: KpiYearRow): KpiCardModel[] {
  const restricted = row.financial_access === "FINANCIAL_DATA_RESTRICTED";
  const money = (
    id: KpiCardModel["id"],
    label: string,
    value: number | null,
    hint: string,
  ): KpiCardModel =>
    restricted
      ? { id, label, value: "Нет доступа", hint: "Финансовые данные недоступны для вашей роли", state: "restricted", financial: true }
      : { id, label, value: formatMoney(value), hint, state: "value", financial: true };

  const plan: KpiCardModel = restricted
    ? money("plan", "План года", null, "")
    : row.plan_status === "NO_APPROVED_VERSION"
      ? { id: "plan", label: "План года", value: "Не утверждён", hint: "Нет утверждённой версии бюджета на этот год", state: "no_plan", financial: true }
      : row.plan_status === "NO_FX"
        ? { id: "plan", label: "План года", value: formatMoney(row.plan_usd, "USD"), hint: "Не задан бюджетный курс USD→TJS", state: "no_fx", financial: true }
        : { id: "plan", label: "План года", value: formatMoney(row.plan_tjs), hint: `Утверждённая версия: ${formatMoney(row.plan_usd, "USD")}`, state: "value", financial: true };

  const variance: KpiCardModel = restricted
    ? money("variance", "Отклонение от плана", null, "")
    : row.variance_tjs === null
      ? { id: "variance", label: "Отклонение от плана", value: formatMoney(null), hint: "Нужны утверждённый план и бюджетный курс", state: row.plan_status === "NO_FX" ? "no_fx" : "no_plan", financial: true }
      : { id: "variance", label: "Отклонение от плана", value: formatMoney(row.variance_tjs), hint: "Факт минус план", state: "value", financial: true };

  return [
    money("actual", "Фактические расходы", row.financial_actual_tjs, "Проведённые операции без сторно, по дате операции"),
    plan,
    variance,
    {
      id: "delivered",
      label: "Проведено обучений",
      value: formatNumber(row.delivered_count),
      hint: `Уникальных участников: ${formatNumber(row.delivered_unique_participants)} · человеко-часов: ${formatNumber(row.delivered_man_hours)}`,
      state: "value",
      financial: false,
    },
    { id: "in_progress", label: "В процессе", value: formatNumber(row.in_progress_count), hint: "Обучения со статусом «Идёт»", state: "value", financial: false },
    {
      id: "unplanned",
      label: "Внеплановые проведённые",
      value: formatNumber(row.unplanned_delivered_count),
      hint: `Доля: ${formatPercent(row.unplanned_delivered_pct)} · неподтверждённых: ${formatNumber(row.unplanned_unconfirmed_count)}`,
      state: "value",
      financial: false,
    },
    money("unplanned_actual", "Расходы на внеплановые", row.unplanned_financial_actual_tjs, "Часть фактических расходов"),
  ];
}
