import { describe, expect, it } from "vitest";
import { buildPayload, parseDate, parseNumber, parseTrainings } from "./parse";

const TR = [
  ["ID_тренинг", "Тема", "Формат", "Вид обучение ", "Место проведения", "Тренер", "Прод.час", "Дата начало", "Дата окончание ", "Кол-во участников", "Расходы в сомони", "Расходы в сомони на одного человека", "Проект", "Статус", "Статус1"],
  ["20", "Английское право", "онлайн", "Внешн.", "Онлайн", "aifcacademy", "7", "27.04.2026", "28.04.2026", "1", "4977,38", "4977", "п", "Выполнен", "Внеплановый"],
  ["31", "Финансы", "онлайн", "Внешн.", "Онлайн", "Актион", "60", "14.05.2026", "", "1", "2 820", "2820", "у", "Впроцессе", "Плановый "],
  ["50", "Пул талантов", "оффлайн", "Внутр.", "Академия", "Баходурова Сулхия", "04.05.2026", "04.05.2026", "04.05.2026", "37", "0", "0", "у", "Выполнен", "Плановый"],
  ["", "пусто", "", "", "", "", "", "", "", "", "", "", "", "", ""],
  ["31", "дубль", "", "", "", "", "", "", "", "", "", "", "", "", ""],
];

describe("Реестр: разбор листов", () => {
  it("числа и даты", () => {
    expect(parseNumber("4977,38")).toBe(4977.38);
    expect(parseNumber("2 820")).toBe(2820);
    expect(parseNumber("04.05.2026")).toBeNull();
    expect(parseNumber("")).toBeNull();
    expect(parseDate("27.04.2026")).toBe("2026-04-27");
    expect(parseDate("31.02.2026")).toBeNull();
    expect(parseDate("2026-09-24")).toBe("2026-09-24");
  });

  it("тренинги: маппинг, дубли и пустые строки пропущены, дата вместо часов → null", () => {
    const t = parseTrainings(TR);
    expect(t.map((x) => x.id)).toEqual([20, 31, 50]);
    expect(t[0]).toMatchObject({ format: "ONLINE", kind: "EXTERNAL", status: "COMPLETED", source: "UNPLANNED", hours: 7, start: "2026-04-27", end: "2026-04-28", total: 4977.38 });
    expect(t[1]).toMatchObject({ status: "IN_PROGRESS", source: "PLANNED", end: null, total: 2820 });
    expect(t[2]).toMatchObject({ kind: "INTERNAL", hours: null, start: "2026-05-04" });
  });

  it("сумма из основной таблицы идёт как общая, если на листе расходов нет разбивки", () => {
    const EX = [["ID_тренинг", "Аренда помещения", "Кофебрейк", "Обед", "Гонорар тренера ", "Доп.расходы", "Итого"], ["20", "", "", "", "4977", "", "4977"], ["31", "", "", "", "", "", "0"]];
    const PA = [["ID_тренинг", "Дата", "Участник", "Департамент", "Отдел"], ["20", "27.04.2026", " Иванов  Иван ", "Финансовый департамент", "HR"], ["20", "", "", "", ""]];
    const p = buildPayload(TR, PA, EX);
    expect(p.participants).toEqual([{ tid: 20, name: "Иванов Иван", dept: "Финансовый департамент" }]);
    expect(p.expenses.find((e) => e.tid === 20)).toMatchObject({ fee: 4977 });
    expect(p.expenses.find((e) => e.tid === 31)).toMatchObject({ total: 2820 });
    expect(p.expenses.some((e) => e.tid === 50)).toBe(false);
  });
});
