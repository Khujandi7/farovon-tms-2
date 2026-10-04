import { z } from "zod";

/**
 * Публичные переменные окружения (попадают в браузер). Секретов здесь быть не может:
 * service_role и прочие секреты читаются только в серверном коде (src/lib/env.server.ts).
 * NEXT_PUBLIC_* подставляются при сборке, поэтому обращения записаны явно, без process.env[name].
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ message: "NEXT_PUBLIC_SUPABASE_URL должен быть URL проекта Supabase" }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, { message: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY не задан" })
    .refine((v) => !v.startsWith("sb_secret_"), { message: "В публичную переменную попал секретный ключ" }),
});

export type PublicEnv = z.infer<typeof publicSchema>;

export class EnvError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvError";
  }
}

export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues.map((i) => i.message).join("; ");
    throw new EnvError(`Неверная конфигурация окружения: ${details}. См. .env.example`);
  }
  return result.data;
}

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}
