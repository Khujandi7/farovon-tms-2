import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, canDoc, documentUiStatus, extensionOf, formatBytes, isExpired, isFinancialDocType, resolveMime, scopeIsEmpty, validateFile, visibleDocTypes, writableDocTypes } from "./rules";

describe("validateFile", () => {
  it("принимает разрешённые типы", () => {
    expect(validateFile({ name: "a.pdf", size: 1000, type: "application/pdf" })).toEqual({ ok: true, mime: "application/pdf" });
    expect(validateFile({ name: "a.JPG", size: 1000, type: "image/jpeg" }).ok).toBe(true);
  });
  it("определяет тип по расширению, если браузер его не знает", () => {
    expect(validateFile({ name: "t.csv", size: 10, type: "" })).toEqual({ ok: true, mime: "text/csv" });
    expect(validateFile({ name: "t.docx", size: 10, type: "application/octet-stream" }).ok).toBe(true);
  });
  it("отклоняет большой, пустой и неподдерживаемый файл", () => {
    expect(validateFile({ name: "a.pdf", size: MAX_FILE_BYTES + 1, type: "application/pdf" })).toMatchObject({ ok: false });
    expect(validateFile({ name: "a.pdf", size: 0, type: "application/pdf" })).toMatchObject({ ok: false });
    expect(validateFile({ name: "a.exe", size: 10, type: "application/x-msdownload" })).toMatchObject({ ok: false });
    expect(validateFile({ name: "a.zip", size: 10, type: "" })).toMatchObject({ ok: false });
  });
  it("ровно 20 МБ допустимо", () => {
    expect(validateFile({ name: "a.pdf", size: MAX_FILE_BYTES, type: "application/pdf" }).ok).toBe(true);
  });
  it("расширение должно соответствовать типу", () => {
    expect(validateFile({ name: "a.png", size: 10, type: "application/pdf" })).toMatchObject({ ok: false });
    expect(validateFile({ name: "noext", size: 10, type: "application/pdf" })).toMatchObject({ ok: false });
  });
});

describe("helpers", () => {
  it("extensionOf / resolveMime", () => {
    expect(extensionOf("Report.Final.XLSX")).toBe("xlsx");
    expect(extensionOf("noext")).toBe("");
    expect(resolveMime("x.png", "text/html")).toBeNull();
  });
  it("formatBytes", () => {
    expect(formatBytes(500)).toBe("500 Б");
    expect(formatBytes(2048)).toBe("2.0 КБ");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 МБ");
    expect(formatBytes(null)).toBe("—");
  });
  it("documentUiStatus", () => {
    expect(documentUiStatus({ status: "PENDING", archived_at: null })).toBe("PENDING");
    expect(documentUiStatus({ status: "UPLOADED", archived_at: null })).toBe("ACTIVE");
    expect(documentUiStatus({ status: "UPLOADED", archived_at: "2026-01-01" })).toBe("ARCHIVED");
  });
  it("isExpired", () => {
    const today = new Date("2026-06-15T10:00:00Z");
    expect(isExpired("2026-06-14", today)).toBe(true);
    expect(isExpired("2026-06-15", today)).toBe(false);
    expect(isExpired(null, today)).toBe(false);
  });
  it("scopeIsEmpty", () => {
    expect(scopeIsEmpty({})).toBe(true);
    expect(scopeIsEmpty({ agreementId: "x" })).toBe(false);
  });
});

describe("права на типы документов (повторяют can_doc)", () => {
  it("финансовые типы", () => {
    expect(isFinancialDocType("CONTRACT")).toBe(true);
    expect(isFinancialDocType("DIPLOMA")).toBe(false);
    expect(canDoc("HR", "CONTRACT", false)).toBe(false);
    expect(canDoc("VIEWER", "CONTRACT", false)).toBe(false);
    expect(canDoc("FINANCE", "CONTRACT", true)).toBe(true);
  });
  it("нефинансовые типы", () => {
    expect(canDoc("HR", "DIPLOMA", true)).toBe(true);
    expect(canDoc("FINANCE", "DIPLOMA", false)).toBe(true);
    expect(canDoc("FINANCE", "DIPLOMA", true)).toBe(false);
    expect(canDoc("VIEWER", "DIPLOMA", false)).toBe(false);
  });
  it("видимые и загружаемые типы по роли", () => {
    expect(visibleDocTypes("HR")).not.toContain("CONTRACT");
    expect(visibleDocTypes("HR")).toContain("CERTIFICATE");
    expect(visibleDocTypes("VIEWER")).toEqual([]);
    expect(writableDocTypes("FINANCE")).toContain("INVOICE");
    expect(writableDocTypes("FINANCE")).not.toContain("DIPLOMA");
    expect(visibleDocTypes("ADMIN", ["CONTRACT", "AGREEMENT"])).toEqual(["CONTRACT", "AGREEMENT"]);
  });
});
