import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().min(1, { message: "Введите email" }).pipe(z.email({ message: "Неверный формат email" })),
  password: z.string().min(1, { message: "Введите пароль" }).max(256, { message: "Слишком длинный пароль" }),
  next: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export type LoginState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password", string>>;
  email?: string;
};
