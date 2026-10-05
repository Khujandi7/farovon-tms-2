// @vitest-environment node
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../..");

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}
const files = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f));
const read = (f: string) => fs.readFileSync(f, "utf8");
const rel = (f: string) => path.relative(SRC, f);

const SERVER_ONLY_MODULES = ["@/lib/supabase/admin", "@/lib/env.server", "@/lib/users/service", "@/lib/users/guard"];

describe("service_role не попадает в клиентский бандл", () => {
  it("модули с секретами помечены server-only", () => {
    for (const f of ["lib/supabase/admin.ts", "lib/env.server.ts", "lib/users/service.ts", "lib/users/guard.ts"]) {
      expect(read(path.join(SRC, f)), f).toMatch(/^import "server-only";/m);
    }
  });

  it("клиентские компоненты ('use client') не импортируют серверные модули и не знают про ключ", () => {
    const clientFiles = files.filter((f) => /^\s*["']use client["']/.test(read(f)));
    expect(clientFiles.length).toBeGreaterThan(5);
    for (const f of clientFiles) {
      const code = read(f);
      for (const m of SERVER_ONLY_MODULES) expect(code, `${rel(f)} импортирует ${m}`).not.toContain(`"${m}"`);
      expect(code, rel(f)).not.toMatch(/SERVICE_ROLE/i);
    }
  });

  it("имя секретной переменной (не значение) встречается только в env.server.ts, тексте ошибки для ADMIN и проверке на странице", () => {
    const users = files.filter((f) => /SUPABASE_SERVICE_ROLE_KEY/.test(read(f))).map(rel).sort();
    expect(users).toEqual(["app/(app)/settings/users/page.tsx", "lib/env.server.ts", "lib/users/errors.ts"]);
  });

  it("страница Users читает только факт наличия ключа на сервере (не значение); NEXT_PUBLIC для секретов не используется", () => {
    expect(read(path.join(SRC, "app/(app)/settings/users/page.tsx"))).toMatch(/process\.env\.SUPABASE_SERVICE_ROLE_KEY \?/);
    for (const f of files) expect(read(f), rel(f)).not.toMatch(/NEXT_PUBLIC_[A-Z_]*(SERVICE|SECRET)/);
  });

  it("серверные модули импортируются только из серверного кода (actions, page, route, lib)", () => {
    for (const f of files) {
      const code = read(f);
      if (!SERVER_ONLY_MODULES.some((m) => code.includes(`"${m}"`))) continue;
      expect(/^\s*["']use client["']/.test(code), `${rel(f)} — клиентский файл`).toBe(false);
    }
  });
});
