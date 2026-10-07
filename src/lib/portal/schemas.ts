import { z } from "zod";

/**
 * Публичная заявка. Правила повторяют submit_public_request (миграция 20261007100500): БД остаётся последней инстанцией,
 * Zod нужен для понятных сообщений и отсечения мусора до обращения к базе.
 */
export const PUBLIC_FORMATS = ["ONLINE", "OFFLINE", "BLENDED"] as const;
export const PUBLIC_FORMAT_LABELS: Record<(typeof PUBLIC_FORMATS)[number], string> = {
  ONLINE: "Онлайн",
  OFFLINE: "Очно",
  BLENDED: "Смешанный",
};

/** Верхняя граница размера всего тела заявки (в символах JSON): защита от слишком больших запросов. */
export const MAX_PAYLOAD_CHARS = 8000;

const text = (max: number) => z.string().trim().max(max, { message: `Не длиннее ${max} символов` });
const optText = (max: number) =>
  text(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const intField = (min: number, max: number, message: string) =>
  z.preprocess(
    (v) => (typeof v === "string" ? (v.trim() === "" ? undefined : Number(v)) : v),
    z.number({ message }).int({ message }).min(min, { message }).max(max, { message }),
  );

const optId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? Number(v) : v),
  z.number().int().positive().optional(),
);

export const publicRequestSchema = z.object({
  requester_name: text(120).min(3, { message: "Укажите ФИО инициатора" }),
  contact: optText(200),
  department_id: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? Number(v) : v),
    z.number({ message: "Выберите подразделение" }).int({ message: "Выберите подразделение" }).positive({ message: "Выберите подразделение" }),
  ),
  unit_id: optId,
  topic: text(300).min(5, { message: "Укажите тему (от 5 символов)" }),
  direction: optText(200),
  goal: text(2000).min(5, { message: "Опишите цель обучения (от 5 символов)" }),
  participants_planned: intField(1, 1000, "Количество участников: от 1 до 1000"),
  format: z
    .preprocess((v) => (v === "" || v === null ? undefined : v), z.enum(PUBLIC_FORMATS, { message: "Недопустимый формат" }).optional()),
  period: optText(200),
  comment: optText(2000),
});

export type PublicRequestInput = z.input<typeof publicRequestSchema>;
export type PublicRequestData = z.output<typeof publicRequestSchema>;

/** Форма целиком: поля заявки + скрытые служебные (honeypot, токен капчи). */
export const publicSubmitSchema = publicRequestSchema.extend({
  website: z.string().max(500).optional(), // honeypot: люди его не видят и не заполняют
  captcha_token: z.string().max(4000).optional(),
});

/** Токен ссылки: 48 hex-символов (encode(gen_random_bytes(24), 'hex')). Любое другое значение даже не отправляется в БД. */
export const TOKEN_RE = /^[0-9a-f]{48}$/;
export function isValidTokenFormat(token: unknown): token is string {
  return typeof token === "string" && TOKEN_RE.test(token);
}

/** Код заявки REQ-YYYY-NNNN. */
export const REQUEST_CODE_RE = /^REQ-\d{4}-\d{4,}$/;
export function parseRequestCode(data: unknown): string | null {
  const code = data && typeof data === "object" && "code" in data ? (data as { code: unknown }).code : null;
  return typeof code === "string" && REQUEST_CODE_RE.test(code) ? code : null;
}

/** Ответ public_request_options: показываем только то, что нужно форме (названия активных подразделений). */
const optionsSchema = z.object({
  mode: z.enum(["GENERAL", "DEPARTMENT"]),
  label: z.string(),
  departments: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      units: z.array(z.object({ id: z.number().int(), name: z.string() })),
    }),
  ),
});
export type PublicOptions = z.infer<typeof optionsSchema>;

export function parsePublicOptions(data: unknown): PublicOptions | null {
  const r = optionsSchema.safeParse(data);
  if (!r.success) return null;
  if (r.data.departments.length === 0) return null;
  return r.data;
}
