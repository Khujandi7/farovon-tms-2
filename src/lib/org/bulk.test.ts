import { describe, expect, it } from "vitest";
import { normUnitName, parseBulkText, previewBulk, suggestUnits, BULK_MAX_ROWS, type ExistingUnit } from "./bulk";

const dep = (id: number, name: string, active = true): ExistingUnit => ({ id, name, parent_id: null, level: "DEPARTMENT", is_active: active });
const unit = (id: number, name: string, parent: number): ExistingUnit => ({ id, name, parent_id: parent, level: "UNIT", is_active: true });

describe("normUnitName — как norm_name в БД", () => {
  it("регистр, ё/е, знаки и пробелы", () => {
    expect(normUnitName("  Отдел  «Учёта»,  ")).toBe("отдел учета");
    expect(normUnitName("Административно-хозяйственное управление")).toBe("административно хозяйственное управление");
  });
  it("похожие, но разные названия не совпадают", () => {
    expect(normUnitName("Департамент бройлерного направления")).not.toBe(normUnitName("Бройлерное направление"));
  });
});

describe("parseBulkText", () => {
  it("табуляция, «;» и «|»; пустые строки пропускаются; номера строк сохраняются", () => {
    const r = parseBulkText("Цех А\tОтдел 1\n\nЦех Б;Отдел 2\nЦех В|Отдел 3\nТолько департамент");
    expect(r.rows.map((x) => [x.line, x.dept, x.unit])).toEqual([[1, "Цех А", "Отдел 1"], [3, "Цех Б", "Отдел 2"], [4, "Цех В", "Отдел 3"], [5, "Только департамент", null]]);
  });
  it("строка-заголовок «Департамент / Отдел» пропускается", () => {
    expect(parseBulkText("Департамент\tОтдел\nЦех А\tОтдел 1").rows).toHaveLength(1);
  });
  it("больше лимита — флаг tooMany", () => {
    const text = Array.from({ length: BULK_MAX_ROWS + 1 }, (_, i) => `Д${i}`).join("\n");
    expect(parseBulkText(text).tooMany).toBe(true);
  });
});

describe("previewBulk — предпросмотр до записи", () => {
  const existing = [dep(1, "Производство"), unit(2, "Цех 1", 1), dep(3, "Закрытый", false)];

  it("новые, дубликаты в справочнике и повторы в списке различаются", () => {
    const p = previewBulk("Административно-хозяйственное управление\nПроизводство\nадминистративно-хозяйственное УПРАВЛЕНИЕ", existing);
    expect(p.rows.map((r) => r.status)).toEqual(["NEW", "DUPLICATE", "DUPLICATE"]);
    expect(p.counts).toEqual({ new: 1, duplicate: 2, error: 0 });
    expect(p.toCreate).toEqual([{ name: "Административно-хозяйственное управление", parent: null }]);
  });

  it("отдел существующего департамента создаётся, дубль отдела пропускается", () => {
    const p = previewBulk("Производство\tЦех 2\nПроизводство\tЦех 1", existing);
    expect(p.toCreate).toEqual([{ name: "Цех 2", parent: "Производство" }]);
    expect(p.rows.find((r) => r.name === "Цех 1")?.status).toBe("DUPLICATE");
  });

  it("отдел неизвестного департамента: департамент показывается отдельной новой строкой (создание видно и подтверждается)", () => {
    const p = previewBulk("Бройлеры\tОтдел откорма", existing);
    expect(p.toCreate).toEqual([{ name: "Бройлеры", parent: null }, { name: "Отдел откорма", parent: "Бройлеры" }]);
    expect(p.rows.map((r) => r.kind)).toEqual(["DEPARTMENT", "UNIT"]);
  });

  it("ошибки: короткое название, неактивный департамент, длинное название — не попадают в toCreate", () => {
    const p = previewBulk(`x\nЗакрытый\tОтдел\n${"я".repeat(201)}`, existing);
    expect(p.rows.map((r) => r.status)).toEqual(["ERROR", "ERROR", "ERROR"]);
    expect(p.toCreate).toEqual([]);
  });

  it("подтверждённое написание считается дублем, а не новым подразделением", () => {
    const p = previewBulk("Бройлерное направление", [dep(10, "Департамент бройлерного направления")], [{ org_unit_id: 10, alias_norm: "бройлерное направление" }]);
    expect(p.rows[0]).toMatchObject({ status: "DUPLICATE" });
    expect(p.toCreate).toEqual([]);
  });

  it("слишком большой список — одна ошибка и ничего к созданию", () => {
    const text = Array.from({ length: BULK_MAX_ROWS + 1 }, (_, i) => `Д${i}`).join("\n");
    const p = previewBulk(text, existing);
    expect(p.counts.error).toBe(1);
    expect(p.toCreate).toEqual([]);
  });

  it("пустой ввод — пустой предпросмотр", () => {
    expect(previewBulk("  \n ", existing).rows).toEqual([]);
  });
});

describe("suggestUnits — подсказки без авто-слияния", () => {
  it("предлагает кандидатов по общим значимым словам, решает человек", () => {
    const list = [dep(1, "Департамент бройлерного направления"), dep(2, "Финансы")];
    expect(suggestUnits("Бройлерное направление", list, "DEPARTMENT").map((u) => u.id)).toEqual([1]);
  });
  it("неактивные и чужой уровень не предлагаются", () => {
    expect(suggestUnits("Закрытый", [dep(3, "Закрытый", false), unit(4, "Закрытый цех", 1)], "DEPARTMENT")).toEqual([]);
  });
});
