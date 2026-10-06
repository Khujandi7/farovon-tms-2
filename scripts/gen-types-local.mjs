#!/usr/bin/env node
// Генерация src/types/database.ts по ЛОКАЛЬНОЙ базе (после `bash supabase/tests/run_local.sh`), пока миграции Phase 3
// не применены в Production. Использует @supabase/postgres-meta (устанавливается во временный каталог).
// Запуск:  node scripts/gen-types-local.mjs   (нужен локальный PostgreSQL на порту 54329, сокет /tmp)
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "pgmeta-"));
execFileSync("npm", ["init", "-y"], { cwd: dir, stdio: "ignore" });
execFileSync("npm", ["i", "@supabase/postgres-meta"], { cwd: dir, stdio: "ignore" });
const server = spawn("node", [join(dir, "node_modules/@supabase/postgres-meta/dist/server/server.js")], {
  env: { ...process.env, PG_META_DB_URL: "postgresql://postgres@localhost:54329/tms_test?host=/tmp", PG_META_PORT: "1337" },
  stdio: "ignore",
});
try {
  await new Promise((r) => setTimeout(r, 4000));
  const res = await fetch("http://localhost:1337/generators/typescript?included_schemas=public&detect_one_to_one_relationships=true");
  if (!res.ok) throw new Error(`postgres-meta: ${res.status}`);
  let ts = await res.text();
  ts = ts.replace(
    "export type Database = {\n",
    "export type Database = {\n  // Allows to automatically instantiate createClient with right options\n  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)\n  __InternalSupabase: {\n    PostgrestVersion: \"14.5\"\n  }\n",
  );
  const header = [
    "// FAROVON TMS 2.0 — типы БД. База: Production после Phase 1.5 M8 + локально применённые миграции Phase 3A (M10–M13).",
    "// ВНИМАНИЕ: M10–M13 НЕ применены в Production (ждут отдельного подтверждения). После их применения перегенерировать из Supabase.",
    "// Сгенерировано @supabase/postgres-meta по локальной БД (scripts/gen-types-local.mjs); структура Phase 1–2.2 совпадает с Production.",
    "// НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ.",
    "",
  ].join("\n");
  writeFileSync("src/types/database.ts", header + ts);
  console.log("src/types/database.ts обновлён");
} finally {
  server.kill();
}
