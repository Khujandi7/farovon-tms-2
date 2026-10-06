import { describe, expect, it } from "vitest";
import { WF_ERR, workflowErrorMessage } from "./errors";

describe("workflowErrorMessage", () => {
  it("P0012 → просьба указать причину", () => {
    expect(workflowErrorMessage({ code: "P0012", message: "Укажите причину изменения" })).toBe(WF_ERR.reason);
  });
  it("наши P00xx отдают свой русский текст", () => {
    expect(workflowErrorMessage({ code: "P0013", message: "Часы и даты тренинга считаются по заходам: измените заходы" })).toContain("по заходам");
    expect(workflowErrorMessage({ code: "P0002", message: "Обучение внеплановое. Привязка заявки требует подтверждения." })).toContain("внеплановое");
  });
  it("RLS и нехватка прав → forbidden", () => {
    expect(workflowErrorMessage({ code: "42501", message: "Недостаточно прав для этого действия" })).toBe(WF_ERR.forbidden);
    expect(workflowErrorMessage({ code: "42000", message: 'new row violates row-level security policy for table "x"' })).toBe(WF_ERR.forbidden);
  });
  it("дубль и внешний ключ", () => {
    expect(workflowErrorMessage({ code: "23505", message: "duplicate key value violates unique constraint secret_idx" })).toBe(WF_ERR.duplicate);
    expect(workflowErrorMessage({ code: "23503", message: "fk" })).toBe(WF_ERR.inUse);
  });
  it("технические детали не утекают", () => {
    const msg = workflowErrorMessage({ code: "XX000", message: "relation \"secret_table\" does not exist", status: 400 });
    expect(msg).toBe(WF_ERR.generic);
    expect(msg).not.toContain("secret_table");
  });
  it("нет статуса или 5xx → сервис недоступен", () => {
    expect(workflowErrorMessage({ message: "fetch failed" })).toBe(WF_ERR.unavailable);
    expect(workflowErrorMessage({ status: 503 })).toBe(WF_ERR.unavailable);
  });
  it("некорректный ввод", () => {
    expect(workflowErrorMessage({ code: "22P02", message: "invalid input syntax" })).toBe(WF_ERR.invalid);
  });
});
