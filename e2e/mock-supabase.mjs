// Mock Supabase (Auth + PostgREST) ТОЛЬКО для E2E-тестов интерфейса. Не используется приложением.
// Данные вымышленные и помечены как тестовые; цифры KPI взяты из SQL-тестов Phase 1.5.
import http from "node:http";
import crypto from "node:crypto";

export const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54399);
const SECRET = "e2e-only-secret";

export const USERS = {
  "admin@test.local": { id: "00000000-0000-4000-8000-00000000000a", role: "ADMIN", name: "Тестовый Админ" },
  "hr@test.local": { id: "00000000-0000-4000-8000-00000000000c", role: "HR", name: "Тестовый Кадровик" },
  "norole@test.local": { id: "00000000-0000-4000-8000-0000000000ff", role: null, name: "Без роли" },
};
export const PASSWORD = "test-password";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
export function signJwt(payload) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}
function verifyJwt(token) {
  const [h, p, s] = (token ?? "").split(".");
  if (!h || !p || !s) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (expected !== s) return null;
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  return payload.exp * 1000 > Date.now() ? payload : null;
}
const userByEmail = (email) => USERS[email];
const userById = (id) => Object.entries(USERS).find(([, u]) => u.id === id);

export function sessionFor(email) {
  const u = userByEmail(email);
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({ sub: u.id, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: crypto.randomUUID() });
  const user = { id: u.id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "e2e-refresh", user };
}

const kpi = (restricted) => ({
  financial_access: restricted ? "FINANCIAL_DATA_RESTRICTED" : "GRANTED",
  plan_status: restricted ? null : "OK",
  plan_usd: restricted ? null : 1000,
  plan_tjs: restricted ? null : 11000,
  financial_actual_tjs: restricted ? null : 4200,
  variance_tjs: restricted ? null : -6800,
  delivered_count: 3,
  delivered_unique_participants: 4,
  delivered_man_hours: 56,
  in_progress_count: 1,
  unplanned_delivered_count: 2,
  unplanned_delivered_pct: 66.67,
  unplanned_unconfirmed_count: 1,
  unplanned_financial_actual_tjs: restricted ? null : 1200,
});

const trainings = [
  { id: "e2e-1", canonical_id: "TEST-0001", title: "Тестовый тренинг А", start_date: "2026-03-10", end_date: "2026-03-11", hours: 8, status: "COMPLETED", source_type: "PLANNED", format: "OFFLINE" },
  { id: "e2e-2", canonical_id: "TEST-0002", title: "Тестовый тренинг Б", start_date: "2026-05-20", end_date: "2026-05-20", hours: 4, status: "PLANNED", source_type: "UNPLANNED", format: "ONLINE" },
];

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

export const createMockServer = () => http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const claims = verifyJwt(bearer);
  const entry = claims ? userById(claims.sub) : undefined;

  if (url.pathname === "/health") return send(res, 200, { ok: true });

  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    const { email, password } = JSON.parse(raw || "{}");
    if (!userByEmail(email) || password !== PASSWORD) {
      return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    }
    return send(res, 200, sessionFor(email));
  }
  if (url.pathname === "/auth/v1/user") {
    if (!entry) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
    const [email, u] = entry;
    return send(res, 200, { id: u.id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {} });
  }
  if (url.pathname === "/auth/v1/logout") return send(res, 204);

  // PostgREST: всё ниже требует вошедшего пользователя
  if (url.pathname.startsWith("/rest/v1/")) {
    if (!entry) return send(res, 401, { message: "JWT expired" });
    const [, u] = entry;
    if (url.pathname === "/rest/v1/rpc/app_role") return send(res, 200, u.role);
    if (url.pathname === "/rest/v1/rpc/kpi_year") return send(res, 200, [kpi(u.role === "HR")]);
    if (url.pathname === "/rest/v1/profiles") {
      const row = { full_name: u.name };
      return (req.headers.accept ?? "").includes("vnd.pgrst.object") ? send(res, 200, row) : send(res, 200, [row]);
    }
    if (url.pathname === "/rest/v1/trainings") return send(res, 200, trainings);
    return send(res, 404, { message: `mock: ${url.pathname} не реализован` });
  }
  send(res, 404, { message: "not found" });
});

