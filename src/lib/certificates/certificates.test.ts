import { describe, expect, it } from "vitest";
import { certStatusLabel, certStatusTone, daysUntil, daysWord, expiryNote, isExpiringSoon } from "./status";
import { parseCertListParams, certListQuery } from "./list-params";
import { certificateReasonRequired, createCertificateSchema, revokeCertificateSchema, updateCertificateSchema } from "./schemas";

const U = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";
const today = new Date(Date.UTC(2026, 9, 7, 15, 0, 0));

describe("status", () => {
  it("подписи", () => {
    expect(certStatusLabel("NO_EXPIRATION")).toBe("Бессрочный");
    expect(certStatusLabel(null)).toBe("—");
    expect(certStatusTone("ACTIVE")).toBe("success");
  });
  it("дней до истечения", () => {
    expect(daysUntil("2026-10-07", today)).toBe(0);
    expect(daysUntil("2026-11-06", today)).toBe(30);
    expect(daysUntil("2026-10-01", today)).toBe(-6);
    expect(daysUntil(null, today)).toBeNull();
    expect(daysUntil("мусор", today)).toBeNull();
  });
  it("склонение", () => {
    expect(daysWord(1)).toBe("1 день");
    expect(daysWord(3)).toBe("3 дня");
    expect(daysWord(11)).toBe("11 дней");
    expect(daysWord(21)).toBe("21 день");
  });
  it("пометка об истечении", () => {
    expect(expiryNote("ACTIVE", 12)).toEqual({ text: "Истекает через 12 дн.", tone: "warning" });
    expect(expiryNote("ACTIVE", 0)?.text).toBe("Истекает сегодня");
    expect(expiryNote("EXPIRED", -3)).toEqual({ text: "Просрочен на 3 дня", tone: "danger" });
    expect(expiryNote("ACTIVE", 90)).toBeNull();
    expect(expiryNote("NO_EXPIRATION", null)).toBeNull();
    expect(expiryNote("REVOKED", -5)).toBeNull();
  });
  it("скоро истекает", () => {
    expect(isExpiringSoon("ACTIVE", 30)).toBe(true);
    expect(isExpiringSoon("ACTIVE", 31)).toBe(false);
    expect(isExpiringSoon("EXPIRED", -1)).toBe(false);
    expect(isExpiringSoon("ACTIVE", null)).toBe(false);
  });
});

describe("list-params", () => {
  it("разбор", () => {
    const p = parseCertListParams({ status: "EXPIRED", expiring: "1", q: "  Ли% ", provider: U, page: "2" });
    expect(p).toEqual({ status: "EXPIRED", expiring: true, q: "Ли", provider: U, page: 2 });
    expect(parseCertListParams({ status: "X" }).status).toBeNull();
    expect(certListQuery(p, 1)).toContain("expiring=1");
  });
});

describe("schemas", () => {
  const base = { employee_id: U, name: "ACCA Diploma", cert_type: "INTERNATIONAL" };
  it("создание", () => {
    expect(createCertificateSchema.safeParse({ ...base, issue_date: "2026-01-01", expiration_date: "2027-01-01" }).success).toBe(true);
    expect(createCertificateSchema.safeParse({ ...base, issue_date: "2026-01-01", expiration_date: "2025-01-01" }).success).toBe(false);
    expect(createCertificateSchema.safeParse({ ...base, cert_type: "X" }).success).toBe(false);
    expect(createCertificateSchema.parse({ ...base, expiration_date: "", skill_id: "" }).skill_id).toBeNull();
  });
  it("изменение и отзыв", () => {
    expect(updateCertificateSchema.safeParse({ id: U, name: "N1", cert_type: "COURSE" }).success).toBe(true);
    expect(revokeCertificateSchema.safeParse({ id: U, revoked: true, reason: "" }).success).toBe(false);
    expect(revokeCertificateSchema.safeParse({ id: U, revoked: true, reason: "Ошибка выдачи" }).success).toBe(true);
  });
  it("причина при смене дат", () => {
    const a = { issue_date: "2026-01-01", expiration_date: "2027-01-01" };
    expect(certificateReasonRequired(a, { ...a })).toBe(false);
    expect(certificateReasonRequired(a, { ...a, expiration_date: "2028-01-01" })).toBe(true);
    expect(certificateReasonRequired(a, { ...a, expiration_date: null })).toBe(true);
  });
});
