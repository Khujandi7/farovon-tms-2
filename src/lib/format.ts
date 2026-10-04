/**
 * Только отображение. Никаких расчётов: все суммы, курсы и KPI приходят готовыми из PostgreSQL.
 * null/undefined — «нет данных», это НЕ ноль.
 */
const tjs = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const int = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

export const EMPTY_VALUE = "—";

export function formatMoney(value: number | null | undefined, currency = "TJS"): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_VALUE;
  return `${tjs.format(value)} ${currency}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_VALUE;
  return int.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return EMPTY_VALUE;
  return `${tjs.format(value)} %`;
}

/** Даты из БД приходят как 'YYYY-MM-DD'. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return EMPTY_VALUE;
  const d = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? EMPTY_VALUE : date.format(d);
}

export function formatDateRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start) return EMPTY_VALUE;
  if (!end || end === start) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}
