import { z } from "zod";
import { APP_ROLES } from "@/lib/auth/roles";

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 128;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, { message: "Введите email" })
  .max(254, { message: "Слишком длинный email" })
  .pipe(z.email({ message: "Неверный формат email" }));

const roleEnum = z.enum(APP_ROLES as [(typeof APP_ROLES)[number], ...(typeof APP_ROLES)[number][]], { message: "Выберите роль" });
const userId = z.uuid({ message: "Неверный идентификатор пользователя" });

export const inviteUserSchema = z.object({
  email,
  fullName: z.string().trim().min(2, { message: "Введите ФИО (не короче 2 символов)" }).max(150, { message: "ФИО слишком длинное" }),
  role: roleEnum,
});
export type InviteUserInput = z.infer<typeof inviteUserSchema>;

export const changeRoleSchema = z.object({ userId, role: roleEnum });
export const setActiveSchema = z.object({ userId, active: z.boolean() });
export const userIdSchema = z.object({ userId });

export const forgotPasswordSchema = z.object({ email });

const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, { message: `Пароль должен быть не короче ${MIN_PASSWORD_LENGTH} символов` })
  .max(MAX_PASSWORD_LENGTH, { message: `Пароль не длиннее ${MAX_PASSWORD_LENGTH} символов` });

export const setPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Пароли не совпадают" });

export const changePasswordSchema = z
  .object({ current: z.string().min(1, { message: "Введите текущий пароль" }), password: newPassword, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Пароли не совпадают" })
  .refine((v) => v.password !== v.current, { path: ["password"], message: "Новый пароль должен отличаться от текущего" });

export type FormState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string | undefined>;
};

export function fieldErrorsFrom(error: z.ZodError): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string | undefined> };
