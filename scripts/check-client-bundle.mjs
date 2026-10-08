// Проверка после `next build`: секреты не должны попадать в клиентский бандл (.next/static).
// Запуск: SUPABASE_SERVICE_ROLE_KEY=<любое тестовое значение> npm run build && node scripts/check-client-bundle.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? ".next/static");
if (!fs.existsSync(root)) {
  console.error(`Нет ${root}: сначала выполните сборку (npm run build).`);
  process.exit(2);
}
// «sb_secret_» как голый префикс встречается в самой supabase-js и в защитной проверке env.ts (startsWith("sb_secret_")) — это не утечка.
// Утечка — префикс, за которым идёт тело ключа.
const needles = ["SUPABASE_SERVICE_ROLE_KEY", "service_role", /sb_secret_[A-Za-z0-9_-]{16,}/, "GOOGLE_SERVICE_ACCOUNT_JSON", "BEGIN PRIVATE KEY", "oauth2.googleapis.com"];
const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (secret && secret.length >= 8) needles.push(secret);
else console.warn("ВНИМАНИЕ: SUPABASE_SERVICE_ROLE_KEY не задан при сборке — значение ключа проверить нечем (проверяются только имена).");

const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(js|css|html|json|map|txt)$/.test(e.name)) files.push(p);
  }
})(root);

const hits = [];
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  for (const n of needles) if (typeof n === "string" ? text.includes(n) : n.test(text)) hits.push(`${path.relative(process.cwd(), f)}: «${n === secret ? "<значение SUPABASE_SERVICE_ROLE_KEY>" : String(n)}»`);
}
if (hits.length) {
  console.error("УТЕЧКА В КЛИЕНТСКИЙ БАНДЛ:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`OK: проверено файлов: ${files.length}; секретов в клиентском бандле нет.`);
