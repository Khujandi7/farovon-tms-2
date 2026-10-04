/** Годы для фильтра Dashboard. Выбор года влияет только на параметр запроса к kpi_year(). */
export const FIRST_YEAR = 2024;

export function availableYears(now: Date = new Date()): number[] {
  const current = now.getUTCFullYear();
  const years: number[] = [];
  for (let y = current + 1; y >= FIRST_YEAR; y--) years.push(y);
  return years;
}

export function parseYear(value: string | string[] | undefined, now: Date = new Date()): number {
  const current = now.getUTCFullYear();
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{4}$/.test(raw)) return current;
  const y = Number(raw);
  return availableYears(now).includes(y) ? y : current;
}
