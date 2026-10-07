import { describe, expect, it } from "vitest";
import { archiveDocumentSchema, registerDocumentSchema } from "./schemas";

const id = "11111111-1111-4111-8111-111111111111";
const ok = { doc_type: "CONTRACT", title: "Договор", file_name: "d.pdf", mime_type: "application/pdf", size_bytes: 1000, expires_on: "", note: "", scope: { employeeId: id } };

describe("registerDocumentSchema", () => {
  it("принимает корректные данные", () => {
    const r = registerDocumentSchema.safeParse(ok);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.expires_on).toBeUndefined();
  });
  it("нужна связь хотя бы с одной сущностью", () => {
    expect(registerDocumentSchema.safeParse({ ...ok, scope: {} }).success).toBe(false);
  });
  it("проверяет файл на сервере", () => {
    expect(registerDocumentSchema.safeParse({ ...ok, size_bytes: 21 * 1024 * 1024 }).success).toBe(false);
    expect(registerDocumentSchema.safeParse({ ...ok, file_name: "x.exe", mime_type: "application/x-msdownload" }).success).toBe(false);
  });
  it("тип документа и название обязательны", () => {
    expect(registerDocumentSchema.safeParse({ ...ok, doc_type: "SECRET" }).success).toBe(false);
    expect(registerDocumentSchema.safeParse({ ...ok, title: " " }).success).toBe(false);
  });
});

describe("archiveDocumentSchema", () => {
  it("причина обязательна", () => {
    expect(archiveDocumentSchema.safeParse({ id, archived: true, reason: "" }).success).toBe(false);
    expect(archiveDocumentSchema.safeParse({ id, archived: true, reason: "Устарел" }).success).toBe(true);
  });
});
