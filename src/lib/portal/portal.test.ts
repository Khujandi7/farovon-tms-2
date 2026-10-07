import { describe, expect, it } from "vitest";
import { computeClientHash, pickClientIp, resolveHashSecret } from "./client-hash";
import { getCaptchaVerifier, noopCaptcha } from "./captcha";
import { buildRequestUrl, normalizeOrigin, resolveOrigin } from "./link-url";
import { linkStatus } from "./link-status";
import { isNotificationType, notificationTypeLabel, NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS, safeInternalHref } from "./notification-types";
import { flattenGroups, groupSearchRows } from "./search";
import { isValidTokenFormat, parsePublicOptions, parseRequestCode, publicRequestSchema, publicSubmitSchema } from "./schemas";

const valid = {
  requester_name: "Иванов Иван",
  department_id: "5",
  topic: "Excel для аналитиков",
  goal: "Ускорить отчётность",
  participants_planned: "12",
};

describe("схема публичной заявки", () => {
  it("принимает минимально заполненную форму и приводит типы", () => {
    const r = publicRequestSchema.safeParse({ ...valid, unit_id: "", format: "", contact: "  ", comment: "" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.department_id).toBe(5);
      expect(r.data.participants_planned).toBe(12);
      expect(r.data.unit_id).toBeUndefined();
      expect(r.data.format).toBeUndefined();
      expect(r.data.contact).toBeUndefined();
    }
  });
  it("повторяет ограничения БД", () => {
    const bad = (patch: Record<string, unknown>) => publicRequestSchema.safeParse({ ...valid, ...patch }).success;
    expect(bad({ requester_name: "Ив" })).toBe(false);
    expect(bad({ topic: "abcd" })).toBe(false);
    expect(bad({ goal: "abcd" })).toBe(false);
    expect(bad({ goal: "x".repeat(2001) })).toBe(false);
    expect(bad({ department_id: "" })).toBe(false);
    expect(bad({ participants_planned: "0" })).toBe(false);
    expect(bad({ participants_planned: "1001" })).toBe(false);
    expect(bad({ participants_planned: "2.5" })).toBe(false);
    expect(bad({ participants_planned: "" })).toBe(false);
    expect(bad({ format: "REMOTE" })).toBe(false);
    expect(bad({ format: "ONLINE" })).toBe(true);
    expect(bad({ period: "x".repeat(201) })).toBe(false);
    expect(bad({ contact: "x".repeat(201) })).toBe(false);
    expect(bad({ comment: "x".repeat(2001) })).toBe(false);
    expect(bad({ requester_name: "x".repeat(121) })).toBe(false);
  });
  it("служебные поля honeypot и captcha допустимы только в полной схеме", () => {
    const r = publicSubmitSchema.safeParse({ ...valid, website: "spam" });
    expect(r.success && r.data.website).toBe("spam");
    const plain = publicRequestSchema.safeParse({ ...valid, website: "spam" });
    expect(plain.success && "website" in plain.data).toBe(false);
  });
});

describe("токен, код заявки, варианты формы", () => {
  it("токен — ровно 48 hex", () => {
    expect(isValidTokenFormat("a".repeat(48))).toBe(true);
    expect(isValidTokenFormat("A".repeat(48))).toBe(false);
    expect(isValidTokenFormat("a".repeat(47))).toBe(false);
    expect(isValidTokenFormat("../".repeat(16))).toBe(false);
    expect(isValidTokenFormat(null)).toBe(false);
  });
  it("код заявки REQ-YYYY-NNNN", () => {
    expect(parseRequestCode({ code: "REQ-2026-0042" })).toBe("REQ-2026-0042");
    expect(parseRequestCode({ code: "REQ-2026-007" })).toBe("REQ-2026-007");
    expect(parseRequestCode({ code: "x" })).toBeNull();
    expect(parseRequestCode(null)).toBeNull();
  });
  it("варианты: пустой список подразделений = закрыто", () => {
    expect(parsePublicOptions(null)).toBeNull();
    expect(parsePublicOptions({ mode: "GENERAL", label: "x", departments: [] })).toBeNull();
    expect(parsePublicOptions({ mode: "DEPARTMENT", label: "x", departments: [{ id: 1, name: "Д", units: [] }] })?.departments).toHaveLength(1);
  });
});

describe("client_hash (HMAC-SHA256)", () => {
  it("детерминирован, 64 hex, зависит от секрета, IP и User-Agent, не содержит IP", () => {
    const h = computeClientHash("203.0.113.7", "UA/1.0", "secret-secret-secret");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(computeClientHash("203.0.113.7", "UA/1.0", "secret-secret-secret")).toBe(h);
    expect(computeClientHash("203.0.113.8", "UA/1.0", "secret-secret-secret")).not.toBe(h);
    expect(computeClientHash("203.0.113.7", "UA/2.0", "secret-secret-secret")).not.toBe(h);
    expect(computeClientHash("203.0.113.7", "UA/1.0", "other-secret-value")).not.toBe(h);
    expect(h).not.toContain("203");
  });
  it("IP берётся из x-forwarded-for (первый адрес)", () => {
    expect(pickClientIp("1.1.1.1, 2.2.2.2", "3.3.3.3")).toBe("1.1.1.1");
    expect(pickClientIp(null, "3.3.3.3")).toBe("3.3.3.3");
    expect(pickClientIp(null, null)).toBe("unknown");
  });
  it("секрет: свой, затем производный от service_role, затем dev-значение", () => {
    expect(resolveHashSecret({ PUBLIC_REQUEST_HASH_SECRET: "x".repeat(20), DERIVE_FROM: "k" })).toBe("x".repeat(20));
    const derived = resolveHashSecret({ DERIVE_FROM: "service-key" });
    expect(derived).toMatch(/^[0-9a-f]{64}$/);
    expect(derived).not.toContain("service-key");
    expect(resolveHashSecret({ PUBLIC_REQUEST_HASH_SECRET: "short" })).toBe(resolveHashSecret({}));
  });
});

describe("CAPTCHA-хук", () => {
  it("по умолчанию no-op, неизвестный провайдер закрывает", async () => {
    expect(await noopCaptcha(undefined, { ip: "x" })).toEqual({ ok: true });
    expect((await getCaptchaVerifier(undefined)("t", { ip: "x" })).ok).toBe(true);
    expect((await getCaptchaVerifier("none")("t", { ip: "x" })).ok).toBe(true);
    expect((await getCaptchaVerifier("unknown")("t", { ip: "x" })).ok).toBe(false);
  });
});

describe("ссылки заявок", () => {
  it("формирует полный URL", () => {
    expect(buildRequestUrl("https://tms.example.tj/", "ab".repeat(24))).toBe(`https://tms.example.tj/request/${"ab".repeat(24)}`);
    expect(buildRequestUrl("https://tms.example.tj")).toBe("https://tms.example.tj/request");
  });
  it("origin: env приоритетнее заголовков, мусор отбрасывается", () => {
    expect(resolveOrigin({ envUrl: "https://tms.example.tj/app", host: "evil.test" })).toBe("https://tms.example.tj");
    expect(resolveOrigin({ envUrl: "", host: "tms.vercel.app", proto: "https" })).toBe("https://tms.vercel.app");
    expect(resolveOrigin({ host: "localhost:3000", proto: "http" })).toBe("http://localhost:3000");
    expect(resolveOrigin({ host: "bad host/../" })).toBe("http://localhost:3000");
    expect(normalizeOrigin("javascript:alert(1)")).toBeNull();
    expect(normalizeOrigin("tms.example.tj")).toBe("https://tms.example.tj");
  });
  it("статус ссылки", () => {
    const now = new Date("2026-10-07T00:00:00Z");
    expect(linkStatus({ is_active: true, replaced_by: null, expires_at: null }, now)).toBe("ACTIVE");
    expect(linkStatus({ is_active: false, replaced_by: null, expires_at: null }, now)).toBe("DISABLED");
    expect(linkStatus({ is_active: false, replaced_by: "x", expires_at: null }, now)).toBe("REPLACED");
    expect(linkStatus({ is_active: true, replaced_by: null, expires_at: "2026-10-01T00:00:00Z" }, now)).toBe("EXPIRED");
  });
});

describe("уведомления и поиск", () => {
  it("все 8 типов подписаны по-русски", () => {
    expect(NOTIFICATION_TYPES).toHaveLength(8);
    for (const t of NOTIFICATION_TYPES) expect(NOTIFICATION_TYPE_LABELS[t]).toMatch(/[а-яА-Я]/);
    expect(isNotificationType("NEW_REQUEST")).toBe(true);
    expect(isNotificationType("x")).toBe(false);
    expect(notificationTypeLabel("UNKNOWN")).toBe("UNKNOWN");
  });
  it("href только внутренний", () => {
    expect(safeInternalHref("/trainings/1")).toBe("/trainings/1");
    expect(safeInternalHref("//evil.test")).toBeNull();
    expect(safeInternalHref("https://evil.test")).toBeNull();
    expect(safeInternalHref(null)).toBeNull();
  });
  it("группировка поиска: порядок, дубликаты, внешние ссылки", () => {
    const rows = [
      { kind: "TRAINING", id: "1", title: "T", subtitle: "", href: "/trainings/1" },
      { kind: "EMPLOYEE", id: "2", title: "E", subtitle: "", href: "/employees/2" },
      { kind: "EMPLOYEE", id: "2", title: "E dup", subtitle: "", href: "/employees/2" },
      { kind: "EMPLOYEE", id: "3", title: "X", subtitle: "", href: "//evil" },
    ];
    const g = groupSearchRows(rows);
    expect(g.map((x) => x.kind)).toEqual(["EMPLOYEE", "TRAINING"]);
    expect(flattenGroups(g)).toHaveLength(2);
  });
  it("поиск показывает тренеров и документы после основных групп", () => {
    const rows = [
      { kind: "DOCUMENT", id: "d", title: "Программа", subtitle: "", href: "/trainings/1?tab=documents" },
      { kind: "TRAINER", id: "t", title: "Алиев", subtitle: "", href: "/trainers/t" },
      { kind: "CERTIFICATE", id: "c", title: "Сертификат", subtitle: "", href: "/employees/1?tab=certificates" },
      { kind: "EMPLOYEE", id: "e", title: "Алиев А.", subtitle: "", href: "/employees/1" },
    ];
    const g = groupSearchRows(rows);
    expect(g.map((x) => x.kind)).toEqual(["EMPLOYEE", "CERTIFICATE", "TRAINER", "DOCUMENT"]);
    expect(g.map((x) => x.label)).toEqual(["Сотрудники", "Сертификаты", "Тренеры", "Документы"]);
  });
});
