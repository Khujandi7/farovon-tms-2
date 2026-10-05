// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const ADMIN = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-0000000000b1";
const OTHER_ADMIN = "00000000-0000-4000-8000-0000000000b2";

type Profile = { id: string; role: string; is_active: boolean };
const db: { profiles: Profile[]; insertError: unknown; updateError: unknown; updateRows: number; selectError: unknown } = {
  profiles: [],
  insertError: null,
  updateError: null,
  updateRows: 1,
  selectError: null,
};
const calls = { inserts: [] as unknown[], updates: [] as unknown[] };

function profilesTable() {
  return {
    select: () => {
      const builder = {
        data: db.profiles,
        error: db.selectError,
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: db.selectError ? null : db.profiles, error: db.selectError }).then(res),
        eq: (_c: string, id: string) => ({ maybeSingle: async () => ({ data: db.profiles.find((p) => p.id === id) ?? null, error: null }) }),
        order: () => builder,
      };
      return builder;
    },
    insert: async (row: unknown) => {
      calls.inserts.push(row);
      return { error: db.insertError };
    },
    update: (patch: unknown) => ({
      eq: () => ({
        select: async () => {
          calls.updates.push(patch);
          return { data: db.updateError ? null : Array.from({ length: db.updateRows }, (_, i) => ({ id: String(i) })), error: db.updateError };
        },
      }),
    }),
  };
}

const admin = {
  auth: {
    admin: {
      inviteUserByEmail: vi.fn(),
      deleteUser: vi.fn(),
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
    },
  },
};
const stateless = { auth: { resetPasswordForEmail: vi.fn() } };
const getSession = vi.fn();
const findAuthUserByEmail = vi.fn();
const getServiceRoleKey = vi.fn(() => "service-key");

vi.mock("@/lib/auth/session", () => ({ getSession: () => getSession() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ from: () => profilesTable() })) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin, createStatelessClient: () => stateless }));
vi.mock("@/lib/env.server", () => ({ getServiceRoleKey: () => getServiceRoleKey(), getSiteUrl: () => "https://tms.example" }));
vi.mock("@/lib/users/service", () => ({ findAuthUserByEmail: (e: string) => findAuthUserByEmail(e) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { changeRole, inviteUser, resendInvite, sendPasswordReset, setUserActive } from "./actions";
import { ERR } from "@/lib/users/errors";

const asRole = (role: string | null, userId = ADMIN) =>
  getSession.mockResolvedValue(role ? { status: "ok", userId, email: "a@x.test", role, fullName: "Тест" } : { status: "no_access", userId, email: null });
const noAdminCalls = () => {
  for (const fn of Object.values(admin.auth.admin)) expect(fn).not.toHaveBeenCalled();
  expect(stateless.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  expect(calls.inserts).toHaveLength(0);
  expect(calls.updates).toHaveLength(0);
};

beforeEach(() => {
  vi.clearAllMocks();
  getServiceRoleKey.mockReturnValue("service-key");
  db.profiles = [
    { id: ADMIN, role: "ADMIN", is_active: true },
    { id: OTHER, role: "HR", is_active: true },
  ];
  db.insertError = null;
  db.updateError = null;
  db.updateRows = 1;
  db.selectError = null;
  calls.inserts = [];
  calls.updates = [];
  findAuthUserByEmail.mockResolvedValue(null);
  admin.auth.admin.inviteUserByEmail.mockResolvedValue({ data: { user: { id: OTHER } }, error: null });
  admin.auth.admin.deleteUser.mockResolvedValue({ error: null });
  admin.auth.admin.updateUserById.mockResolvedValue({ error: null });
  admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: OTHER, email: "u@x.test", email_confirmed_at: null } }, error: null });
  stateless.auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  asRole("ADMIN");
});

const invite = { email: "New.User@Example.com", fullName: "Новый Сотрудник", role: "FINANCE" };

describe("права: только ADMIN выполняет административные действия", () => {
  const attempts: [string, () => Promise<{ ok: boolean; error?: string }>][] = [
    ["inviteUser", () => inviteUser(invite)],
    ["changeRole", () => changeRole({ userId: OTHER, role: "ADMIN" })],
    ["setUserActive", () => setUserActive({ userId: OTHER, active: false })],
    ["resendInvite", () => resendInvite({ userId: OTHER })],
    ["sendPasswordReset", () => sendPasswordReset({ userId: OTHER })],
  ];
  for (const role of ["ACADEMY_MANAGER", "HR", "FINANCE", "VIEWER"]) {
    for (const [name, run] of attempts) {
      it(`${role} не может ${name}`, async () => {
        asRole(role, OTHER);
        const res = await run();
        expect(res).toMatchObject({ ok: false, error: ERR.forbidden });
        noAdminCalls();
      });
    }
  }
  it("пользователь без роли (деактивирован / нет профиля) не может ничего", async () => {
    asRole(null);
    for (const [, run] of attempts) expect(await run()).toMatchObject({ ok: false, error: ERR.forbidden });
    noAdminCalls();
  });
  it("аноним не может ничего", async () => {
    getSession.mockResolvedValue({ status: "anonymous" });
    for (const [, run] of attempts) expect(await run()).toMatchObject({ ok: false, error: ERR.forbidden });
    noAdminCalls();
  });
  it("ADMIN может приглашать", async () => {
    expect(await inviteUser(invite)).toMatchObject({ ok: true });
  });
});

describe("inviteUser: приглашение → создание profile", () => {
  it("создаёт приглашение с redirect на /auth/confirm и профиль с выбранной ролью", async () => {
    const res = await inviteUser(invite);
    expect(res).toMatchObject({ ok: true });
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith("new.user@example.com", {
      redirectTo: "https://tms.example/auth/confirm",
      data: { full_name: "Новый Сотрудник" }, // роли в user_metadata нет
    });
    expect(calls.inserts).toEqual([{ id: OTHER, full_name: "Новый Сотрудник", role: "FINANCE" }]);
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("откат: профиль не создался → созданный пользователь Auth удаляется", async () => {
    db.insertError = { code: "42501", message: "new row violates row-level security policy" };
    const res = await inviteUser(invite);
    expect(res).toMatchObject({ ok: false, error: ERR.forbidden });
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith(OTHER);
  });

  it("откат не удался: сообщение требует ручного удаления", async () => {
    db.insertError = { code: "23505", message: "dup" };
    admin.auth.admin.deleteUser.mockResolvedValue({ error: { code: "unexpected_failure", status: 500, message: "x" } });
    const res = await inviteUser(invite);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.error).toMatch(/удалите его вручную/);
  });

  it("существующий пользователь с профилем: приглашение не отправляется", async () => {
    findAuthUserByEmail.mockResolvedValue({ id: OTHER, email: "new.user@example.com", email_confirmed_at: null });
    const res = await inviteUser(invite);
    expect(res).toMatchObject({ ok: false, error: ERR.exists });
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("осиротевшее неподтверждённое приглашение переиспользуется и при сбое профиля НЕ удаляется", async () => {
    const orphan = "00000000-0000-4000-8000-0000000000c9";
    findAuthUserByEmail.mockResolvedValue({ id: orphan, email: "new.user@example.com", email_confirmed_at: null });
    admin.auth.admin.inviteUserByEmail.mockResolvedValue({ data: { user: { id: orphan } }, error: null });
    db.insertError = { code: "42501", message: "rls" };
    const res = await inviteUser(invite);
    expect(res.ok).toBe(false);
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("ошибка Auth превращается в понятное сообщение, профиль не создаётся", async () => {
    admin.auth.admin.inviteUserByEmail.mockResolvedValue({ data: { user: null }, error: { code: "over_email_send_rate_limit", status: 429, message: "x" } });
    const res = await inviteUser(invite);
    expect(res).toMatchObject({ ok: false, error: ERR.rateLimit });
    expect(calls.inserts).toHaveLength(0);
  });

  it("Zod: неверный email, короткое ФИО, неизвестная роль", async () => {
    const res = await inviteUser({ email: "bad", fullName: "А", role: "SUPERUSER" });
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.fieldErrors).toMatchObject({ email: "Неверный формат email" });
    expect(res.ok === false && Object.keys(res.fieldErrors ?? {})).toEqual(expect.arrayContaining(["email", "fullName", "role"]));
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("нет SUPABASE_SERVICE_ROLE_KEY: понятная ошибка конфигурации", async () => {
    getServiceRoleKey.mockImplementation(() => {
      throw new Error("missing");
    });
    expect(await inviteUser(invite)).toMatchObject({ ok: false, error: ERR.notConfigured });
  });
});

describe("changeRole", () => {
  it("нельзя менять собственную роль", async () => {
    expect(await changeRole({ userId: ADMIN, role: "VIEWER" })).toMatchObject({ ok: false, error: ERR.self });
    expect(calls.updates).toHaveLength(0);
  });
  it("нельзя понизить последнего активного ADMIN", async () => {
    asRole("ADMIN", OTHER_ADMIN);
    db.profiles = [{ id: ADMIN, role: "ADMIN", is_active: true }, { id: OTHER_ADMIN, role: "ADMIN", is_active: false }];
    expect(await changeRole({ userId: ADMIN, role: "HR" })).toMatchObject({ ok: false, error: ERR.lastAdmin });
    expect(calls.updates).toHaveLength(0);
  });
  it("ADMIN меняет роль другому (при нескольких ADMIN можно понизить ADMIN)", async () => {
    db.profiles = [...db.profiles, { id: OTHER_ADMIN, role: "ADMIN", is_active: true }];
    expect(await changeRole({ userId: OTHER_ADMIN, role: "HR" })).toMatchObject({ ok: true });
    expect(calls.updates).toEqual([{ role: "HR" }]);
  });
  it("триггер БД P0003 (гонка) превращается в понятное сообщение", async () => {
    db.updateError = { code: "P0003", message: "Нельзя убрать, понизить или деактивировать последнего активного ADMIN" };
    expect(await changeRole({ userId: OTHER, role: "VIEWER" })).toMatchObject({ ok: false, error: ERR.lastAdmin });
  });
  it("триггер БД P0011 (self-protect) превращается в понятное сообщение", async () => {
    db.updateError = { code: "P0011", message: "Нельзя изменить собственную роль или статус активности" };
    expect(await changeRole({ userId: OTHER, role: "VIEWER" })).toMatchObject({ ok: false, error: ERR.self });
  });
  it("RLS не обновила ни одной строки: отказ, а не молчаливый успех", async () => {
    db.updateRows = 0;
    expect(await changeRole({ userId: OTHER, role: "VIEWER" })).toMatchObject({ ok: false, error: ERR.forbidden });
  });
  it("несуществующий пользователь и неверная роль", async () => {
    expect(await changeRole({ userId: "00000000-0000-4000-8000-0000000000ee", role: "HR" })).toMatchObject({ ok: false, error: ERR.notFound });
    expect((await changeRole({ userId: OTHER, role: "ROOT" })).ok).toBe(false);
  });
});

describe("setUserActive", () => {
  it("ADMIN не может деактивировать самого себя", async () => {
    expect(await setUserActive({ userId: ADMIN, active: false })).toMatchObject({ ok: false, error: ERR.self });
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
  it("нельзя деактивировать последнего активного ADMIN", async () => {
    asRole("ADMIN", OTHER_ADMIN);
    db.profiles = [{ id: ADMIN, role: "ADMIN", is_active: true }, { id: OTHER_ADMIN, role: "ADMIN", is_active: false }];
    expect(await setUserActive({ userId: ADMIN, active: false })).toMatchObject({ ok: false, error: ERR.lastAdmin });
    expect(calls.updates).toHaveLength(0);
  });
  it("деактивация: сначала профиль, затем блокировка входа в Auth", async () => {
    const res = await setUserActive({ userId: OTHER, active: false });
    expect(res).toMatchObject({ ok: true });
    expect(calls.updates).toEqual([{ is_active: false }]);
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith(OTHER, { ban_duration: "876000h" });
  });
  it("блокировка не удалась: доступ всё равно закрыт (is_active), пользователь получает пояснение", async () => {
    admin.auth.admin.updateUserById.mockResolvedValue({ error: { code: "unexpected_failure", status: 500, message: "x" } });
    const res = await setUserActive({ userId: OTHER, active: false });
    expect(res.ok).toBe(true);
    expect(res.ok && res.message).toMatch(/доступ к данным закрыт/);
  });
  it("восстановление: снимаем блокировку, затем is_active = true", async () => {
    db.profiles = [{ id: ADMIN, role: "ADMIN", is_active: true }, { id: OTHER, role: "HR", is_active: false }];
    const res = await setUserActive({ userId: OTHER, active: true });
    expect(res).toMatchObject({ ok: true });
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith(OTHER, { ban_duration: "none" });
    expect(calls.updates).toEqual([{ is_active: true }]);
  });
  it("восстановление: если снять блокировку не вышло, профиль не трогаем", async () => {
    db.profiles = [{ id: ADMIN, role: "ADMIN", is_active: true }, { id: OTHER, role: "HR", is_active: false }];
    admin.auth.admin.updateUserById.mockResolvedValue({ error: { code: "unexpected_failure", status: 500, message: "x" } });
    expect((await setUserActive({ userId: OTHER, active: true })).ok).toBe(false);
    expect(calls.updates).toHaveLength(0);
  });
});

describe("resendInvite", () => {
  it("неподтверждённому отправляет приглашение повторно", async () => {
    const res = await resendInvite({ userId: OTHER });
    expect(res).toMatchObject({ ok: true });
    expect(admin.auth.admin.inviteUserByEmail).toHaveBeenCalledWith("u@x.test", { redirectTo: "https://tms.example/auth/confirm" });
  });
  it("уже подтвердившему: отказ и подсказка про сброс пароля", async () => {
    admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { id: OTHER, email: "u@x.test", email_confirmed_at: "2026-10-01T00:00:00Z" } }, error: null });
    expect(await resendInvite({ userId: OTHER })).toMatchObject({ ok: false, error: ERR.alreadyConfirmed });
    expect(admin.auth.admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
  it("деактивированному не отправляется", async () => {
    db.profiles = [{ id: ADMIN, role: "ADMIN", is_active: true }, { id: OTHER, role: "HR", is_active: false }];
    expect(await resendInvite({ userId: OTHER })).toMatchObject({ ok: false, error: ERR.inactive });
  });
  it("лимит писем Supabase", async () => {
    admin.auth.admin.inviteUserByEmail.mockResolvedValue({ data: null, error: { code: "over_email_send_rate_limit", status: 429, message: "x" } });
    expect(await resendInvite({ userId: OTHER })).toMatchObject({ ok: false, error: ERR.rateLimit });
  });
});

describe("sendPasswordReset", () => {
  it("отправляет письмо восстановления на email из Auth с redirect на /auth/confirm", async () => {
    const res = await sendPasswordReset({ userId: OTHER });
    expect(res).toMatchObject({ ok: true });
    expect(stateless.auth.resetPasswordForEmail).toHaveBeenCalledWith("u@x.test", { redirectTo: "https://tms.example/auth/confirm" });
  });
  it("деактивированному не отправляется", async () => {
    db.profiles = [{ id: ADMIN, role: "ADMIN", is_active: true }, { id: OTHER, role: "HR", is_active: false }];
    expect(await sendPasswordReset({ userId: OTHER })).toMatchObject({ ok: false, error: ERR.inactive });
    expect(stateless.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });
  it("ошибка Auth: понятное сообщение", async () => {
    stateless.auth.resetPasswordForEmail.mockResolvedValue({ error: { status: 429, message: "x" } });
    expect(await sendPasswordReset({ userId: OTHER })).toMatchObject({ ok: false, error: ERR.rateLimit });
  });
});
