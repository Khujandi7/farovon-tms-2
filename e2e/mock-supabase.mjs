// Mock Supabase (Auth + PostgREST) ТОЛЬКО для E2E-тестов интерфейса. Не используется приложением.
// Данные вымышленные и помечены как тестовые; цифры KPI взяты из SQL-тестов Phase 1.5.
import http from "node:http";
import crypto from "node:crypto";
import { handlePhase3 } from "./mock-phase3.mjs";
import { handleFallback, handlePhase3a1, handlePublic, portalStore } from "./mock-phase3a1.mjs";
import { handlePhase3a2 } from "./mock-phase3a2.mjs";

export const PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 54399);
const SECRET = "e2e-only-secret";

export const SERVICE_KEY = process.env.E2E_SERVICE_ROLE_KEY ?? "e2e-service-role-key";
export const PASSWORD = "test-password";
const SEED_AT = "2026-09-01T09:00:00.000Z";

/** Состояние «базы»: пользователи Auth + profiles. Хранится в памяти процесса mock-сервера. */
export const USERS = {};
const seed = (email, id, role, name, extra = {}) => {
  USERS[email] = {
    id, email, role, name, password: PASSWORD, active: role !== null, hasProfile: role !== null,
    confirmedAt: SEED_AT, invitedAt: null, lastSignInAt: "2026-10-01T08:30:00.000Z", createdAt: SEED_AT, bannedUntil: null, ...extra,
  };
};
seed("admin@test.local", "00000000-0000-4000-8000-00000000000a", "ADMIN", "Тестовый Админ");
seed("hr@test.local", "00000000-0000-4000-8000-00000000000c", "HR", "Тестовый Кадровик");
seed("manager@test.local", "00000000-0000-4000-8000-00000000000b", "ACADEMY_MANAGER", "Тестовый Менеджер");
seed("finance@test.local", "00000000-0000-4000-8000-00000000000e", "FINANCE", "Тестовый Финансист");
seed("viewer@test.local", "00000000-0000-4000-8000-00000000000d", "VIEWER", "Тестовый Наблюдатель");
seed("norole@test.local", "00000000-0000-4000-8000-0000000000ff", null, "Без роли");

/** Отправленные письма (invite / recovery) с одноразовыми токенами: тесты читают их через /__mock/outbox. */
const outbox = [];
const tokens = new Map(); // token_hash -> { email, type }

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
const authUser = (u) => ({
  id: u.id, aud: "authenticated", role: "authenticated", email: u.email,
  email_confirmed_at: u.confirmedAt, confirmed_at: u.confirmedAt, invited_at: u.invitedAt, last_sign_in_at: u.lastSignInAt,
  created_at: u.createdAt, banned_until: u.bannedUntil, app_metadata: {}, user_metadata: { full_name: u.name },
});
const profileRow = (u) => ({ id: u.id, full_name: u.name, role: u.role ?? "VIEWER", is_active: u.active, created_at: u.createdAt });
const appRole = (u) => (u.hasProfile && u.active ? u.role : null);

export function sessionFor(email) {
  const u = userByEmail(email);
  const now = Math.floor(Date.now() / 1000);
  const access_token = signJwt({ sub: u.id, email, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600, session_id: crypto.randomUUID() });
  const user = authUser(u);
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

const readJson = (raw) => { try { return JSON.parse(raw || "{}"); } catch { return {}; } };
const authError = (res, status, code, msg) => send(res, status, { code: status, error_code: code, msg });
const eq = (url, col) => { const v = url.searchParams.get(col); return v?.startsWith("eq.") ? v.slice(3) : null; };

export const createMockServer = () => http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const claims = verifyJwt(bearer);
  const entry = claims ? userById(claims.sub) : undefined;
  const isService = bearer === SERVICE_KEY;
  const body = readJson(raw);

  if (url.pathname === "/health") return send(res, 200, { ok: true });

  // ---- служебные ручки тестов ----
  if (url.pathname === "/__mock/outbox") {
    const email = url.searchParams.get("email");
    return send(res, 200, outbox.filter((m) => !email || m.email === email));
  }
  if (url.pathname === "/__mock/user") {
    const u = USERS[url.searchParams.get("email") ?? ""];
    return send(res, 200, u ? { ...u, password: undefined } : null);
  }

  // ---- Auth: вход, сессия ----
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    const u = userByEmail(body.email);
    if (!u || body.password !== u.password) return authError(res, 400, "invalid_credentials", "Invalid login credentials");
    if (u.bannedUntil) return authError(res, 400, "user_banned", "User is banned");
    u.lastSignInAt = new Date().toISOString();
    return send(res, 200, sessionFor(u.email));
  }
  if (url.pathname === "/auth/v1/user") {
    if (!entry) return authError(res, 401, "bad_jwt", "invalid JWT");
    const [, u] = entry;
    if (req.method === "PUT") {
      if (typeof body.password === "string") {
        if (body.password.length < 12) return authError(res, 422, "weak_password", "Password should be at least 12 characters");
        if (body.password.includes("leaked")) return authError(res, 422, "weak_password", "Password is known to be weak and easy to guess");
        if (body.password === u.password) return authError(res, 422, "same_password", "New password should be different from the old password");
        u.password = body.password;
      }
      return send(res, 200, authUser(u));
    }
    return send(res, 200, authUser(u));
  }
  if (url.pathname === "/auth/v1/logout") return send(res, 204);

  // ---- Auth: письма (recover) и подтверждение (verify) ----
  if (url.pathname === "/auth/v1/recover") {
    const u = userByEmail(body.email);
    if (body.email === "ratelimit@test.local") return authError(res, 429, "over_email_send_rate_limit", "email rate limit exceeded");
    if (u && !u.bannedUntil) {
      const token = crypto.randomBytes(16).toString("hex");
      tokens.set(token, { email: u.email, type: "recovery" });
      outbox.push({ email: u.email, type: "recovery", token });
    }
    return send(res, 200, {}); // как настоящий GoTrue: ответ не зависит от существования email
  }
  if (url.pathname === "/auth/v1/verify") {
    const t = tokens.get(body.token_hash);
    if (!t || t.type !== body.type) return authError(res, 403, "otp_expired", "Email link is invalid or has expired");
    tokens.delete(body.token_hash); // одноразовый
    const u = userByEmail(t.email);
    u.confirmedAt ??= new Date().toISOString();
    u.lastSignInAt = new Date().toISOString();
    return send(res, 200, sessionFor(u.email));
  }

  // ---- Auth Admin API (только service_role) ----
  if (url.pathname.startsWith("/auth/v1/admin/") || url.pathname === "/auth/v1/invite") {
    if (!isService) return authError(res, 403, "not_admin", "User not allowed");
    if (url.pathname === "/auth/v1/invite") {
      const email = String(body.email ?? "").toLowerCase();
      if (email.startsWith("ratelimit@")) return authError(res, 429, "over_email_send_rate_limit", "email rate limit exceeded");
      let u = USERS[email];
      if (u && u.confirmedAt) return authError(res, 422, "email_exists", "A user with this email address has already been registered");
      if (!u) {
        u = { id: crypto.randomUUID(), email, role: null, name: body.data?.full_name ?? email, password: crypto.randomBytes(8).toString("hex"), active: true, hasProfile: false,
          confirmedAt: null, invitedAt: null, lastSignInAt: null, createdAt: new Date().toISOString(), bannedUntil: null };
        USERS[email] = u;
      }
      u.invitedAt = new Date().toISOString();
      const token = crypto.randomBytes(16).toString("hex");
      tokens.set(token, { email, type: "invite" });
      outbox.push({ email, type: "invite", token, redirectTo: url.searchParams.get("redirect_to") });
      return send(res, 200, authUser(u));
    }
    if (url.pathname === "/auth/v1/admin/users" && req.method === "GET") {
      return send(res, 200, { users: Object.values(USERS).map(authUser), aud: "authenticated" });
    }
    const m = url.pathname.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/);
    const target = m ? Object.values(USERS).find((u) => u.id === m[1]) : undefined;
    if (!m || !target) return authError(res, 404, "user_not_found", "User not found");
    if (req.method === "GET") return send(res, 200, authUser(target));
    if (req.method === "PUT") {
      if (body.ban_duration !== undefined) target.bannedUntil = body.ban_duration === "none" ? null : "2126-01-01T00:00:00.000Z";
      return send(res, 200, authUser(target));
    }
    if (req.method === "DELETE") {
      delete USERS[target.email];
      return send(res, 200, authUser(target));
    }
  }

  if (url.pathname === "/__mock/reset" || url.pathname === "/__mock/audit") return handlePhase3(req, res, url, body, null, null);

  // ---- PostgREST: всё ниже требует вошедшего пользователя ----
  if (url.pathname === "/__mock/portal") return send(res, 200, portalStore.submitted);
  if (url.pathname.startsWith("/rest/v1/")) {
    if (isService && handlePublic(req, res, url, body)) return;
    if (url.pathname.startsWith("/rest/v1/rpc/public_request")) return send(res, 401, { code: "42501", message: "permission denied" });
    if (!entry) return send(res, 401, { message: "JWT expired" });
    const [, u] = entry;
    const role = appRole(u);
    if (url.pathname === "/rest/v1/rpc/app_role") return send(res, 200, role);
    const special = ["/rest/v1/rpc/app_role", "/rest/v1/rpc/kpi_year", "/rest/v1/profiles", "/rest/v1/trainings"].includes(url.pathname);
    if (!["/rest/v1/rpc/app_role", "/rest/v1/rpc/kpi_year", "/rest/v1/profiles"].includes(url.pathname) && handlePhase3a2(req, res, url, body, role, claims?.session_id)) return;
    if (!special && handlePhase3a1(req, res, url, body, role)) return;
    if (!["/rest/v1/rpc/app_role", "/rest/v1/rpc/kpi_year", "/rest/v1/profiles"].includes(url.pathname) && handlePhase3(req, res, url, body, role, u, claims?.session_id)) return;
    if (url.pathname === "/rest/v1/rpc/kpi_year") return send(res, 200, [kpi(role === "HR")]);
    if (url.pathname === "/rest/v1/trainings") return send(res, 200, trainings);
    if (url.pathname === "/rest/v1/profiles") {
      const wantsObject = (req.headers.accept ?? "").includes("vnd.pgrst.object");
      const profiles = Object.values(USERS).filter((x) => x.hasProfile);
      if (req.method === "GET") {
        if (!role) return send(res, 200, []); // RLS: без роли строк нет
        const id = eq(url, "id");
        const rows = profiles.filter((x) => !id || x.id === id).map(profileRow);
        if (wantsObject) return rows.length === 1 ? send(res, 200, rows[0]) : send(res, 406, { code: "PGRST116", message: "no rows", details: "The result contains 0 rows" });
        return send(res, 200, rows);
      }
      if (req.method === "POST") {
        if (role !== "ADMIN") return send(res, 403, { code: "42501", message: 'new row violates row-level security policy for table "profiles"' });
        const target = Object.values(USERS).find((x) => x.id === body.id);
        if (!target) return send(res, 409, { code: "23503", message: "profiles_id_fkey" });
        if (target.hasProfile) return send(res, 409, { code: "23505", message: "duplicate key" });
        Object.assign(target, { hasProfile: true, role: body.role ?? "VIEWER", name: body.full_name, active: true });
        return send(res, 201);
      }
      if (req.method === "PATCH") {
        if (role !== "ADMIN") return send(res, 200, []); // RLS: ни одной строки
        const target = profiles.find((x) => x.id === eq(url, "id"));
        if (!target) return send(res, 200, []);
        const changesRole = body.role !== undefined && body.role !== target.role;
        const changesActive = body.is_active !== undefined && body.is_active !== target.active;
        // триггеры БД (M9 profiles_self_protect → P0011; profiles_guard → P0003)
        if (target.id === u.id && (changesRole || changesActive)) return send(res, 400, { code: "P0011", message: "Нельзя изменить собственную роль или статус активности" });
        const admins = profiles.filter((x) => x.role === "ADMIN" && x.active && x.id !== target.id);
        if (target.role === "ADMIN" && target.active && ((changesRole && body.role !== "ADMIN") || body.is_active === false) && admins.length === 0) {
          return send(res, 400, { code: "P0003", message: "Нельзя убрать, понизить или деактивировать последнего активного ADMIN" });
        }
        if (body.role !== undefined) target.role = body.role;
        if (body.is_active !== undefined) target.active = body.is_active;
        return send(res, 200, [{ id: target.id }]);
      }
    }
    if (!special && handleFallback(req, res, url)) return;
    return send(res, 404, { message: `mock: ${url.pathname} не реализован` });
  }
  send(res, 404, { message: "not found" });
});
