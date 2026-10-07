/** Нормализация значений ячеек перед отправкой в import_stage. Окончательная проверка всегда на стороне БД. */

const pad = (n: number) => String(n).padStart(2, "0");

/** Серийный номер даты Excel (система 1900) → ISO. Диапазон 1900..2100. */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 73050) return null;
  // 25569 = дней между 1899-12-30 и 1970-01-01 (учитывает ошибку Excel с 1900-02-29)
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function dateToIsoUtc(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function validYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** ISO, ДД.ММ.ГГГГ, ДД/ММ/ГГГГ, ДД.ММ.ГГ → ГГГГ-ММ-ДД. Непонятное значение возвращается как есть: БД скажет «Неверная дата». */
export function normalizeDate(value: string): string {
  const t = value.trim();
  if (!t) return "";
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(t);
  if (m && validYmd(+m[1]!, +m[2]!, +m[3]!)) return `${m[1]}-${pad(+m[2]!)}-${pad(+m[3]!)}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s.*)?$/.exec(t);
  if (m && validYmd(+m[3]!, +m[2]!, +m[1]!)) return `${m[3]}-${pad(+m[2]!)}-${pad(+m[1]!)}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(t);
  if (m) {
    const y = 2000 + +m[3]!;
    if (validYmd(y, +m[2]!, +m[1]!)) return `${y}-${pad(+m[2]!)}-${pad(+m[1]!)}`;
  }
  if (/^\d{5}(\.\d+)?$/.test(t)) {
    const iso = excelSerialToIso(Number(t));
    if (iso) return iso;
  }
  return t;
}

/** Число: пробелы (в т.ч. неразрывные) убираются, запятая → точка. Нечисловое возвращается как есть. */
export function normalizeNumber(value: string): string {
  const t = value.replace(/[\s  ]/g, "");
  if (!t) return "";
  if (/^-?\d+([.,]\d+)?$/.test(t)) return t.replace(",", ".");
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) return t.replace(/,/g, "");
  return value.trim();
}

const DATE_FIELDS = new Set(["hire_date", "termination_date", "start_date", "end_date", "exam_date", "issue_date", "expiration_date", "date"]);
const NUMBER_FIELDS = new Set(["hours", "amount", "fee", "score"]);

const FORMAT_MAP: Record<string, string> = {
  online: "ONLINE", онлайн: "ONLINE", дистанционно: "ONLINE", дистанционный: "ONLINE",
  offline: "OFFLINE", очно: "OFFLINE", очный: "OFFLINE", оффлайн: "OFFLINE", офлайн: "OFFLINE",
  blended: "BLENDED", смешанный: "BLENDED", смешанно: "BLENDED", гибридный: "BLENDED",
};
const FUNDING_MAP: Record<string, string> = {
  company: "COMPANY", компания: "COMPANY", работодатель: "COMPANY", employee: "EMPLOYEE", сотрудник: "EMPLOYEE", работник: "EMPLOYEE",
  shared: "SHARED", совместно: "SHARED", "пополам": "SHARED", external: "EXTERNAL", внешний: "EXTERNAL", внешнее: "EXTERNAL", other: "OTHER", другое: "OTHER", иное: "OTHER",
};
const CERT_TYPE_MAP: Record<string, string> = {
  training: "TRAINING", тренинг: "TRAINING", обучение: "TRAINING", course: "COURSE", курс: "COURSE", exam: "EXAM", экзамен: "EXAM",
  international: "INTERNATIONAL", международный: "INTERNATIONAL", diploma: "DIPLOMA", диплом: "DIPLOMA", license: "LICENSE", licence: "LICENSE", лицензия: "LICENSE",
};
const CURRENCY_MAP: Record<string, string> = { сомони: "TJS", смн: "TJS", "сом": "TJS", "$": "USD", "€": "EUR", "₽": "RUB", руб: "RUB", рубль: "RUB", доллар: "USD", евро: "EUR" };

const lower = (s: string) => s.trim().toLowerCase().replace(/ё/g, "е");

/** Нормализует значение поля. Пустое → пустая строка. */
export function normalizeValue(key: string, value: string): string {
  const v = value.trim();
  if (!v) return "";
  if (DATE_FIELDS.has(key)) return normalizeDate(v);
  if (NUMBER_FIELDS.has(key)) return normalizeNumber(v);
  if (key === "format") return FORMAT_MAP[lower(v)] ?? v;
  if (key === "funding_source") return FUNDING_MAP[lower(v)] ?? v;
  if (key === "cert_type") return CERT_TYPE_MAP[lower(v)] ?? v;
  if (key === "currency") return CURRENCY_MAP[lower(v)] ?? v.toUpperCase();
  if (key === "email") return v.toLowerCase();
  if (key === "training") return v.toUpperCase();
  return v.replace(/\s+/g, " ");
}
