import { describe, expect, it } from "vitest";
import { EnvError, parsePublicEnv } from "./env";

describe("parsePublicEnv", () => {
  it("принимает URL и публичный ключ", () => {
    const env = parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" });
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://abc.supabase.co");
  });
  it("падает с понятной ошибкой без настроек", () => {
    expect(() => parsePublicEnv({})).toThrow(EnvError);
  });
  it("не принимает секретный ключ в публичной переменной", () => {
    expect(() => parsePublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "https://abc.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_123" })).toThrow(/секретный ключ/);
  });
});
