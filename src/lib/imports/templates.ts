import { ENTITY_DEFS, type ImportEntity } from "./entities";

/** Шаблон .xlsx: лист «Данные» (заголовки + пример) и лист «Инструкция». Только сервер. */
export async function buildTemplateXlsx(entity: ImportEntity): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const def = ENTITY_DEFS[entity];
  const wb = new ExcelJS.Workbook();
  wb.creator = "FAROVON TMS";
  const data = wb.addWorksheet("Данные", { views: [{ state: "frozen", ySplit: 1 }] });
  data.columns = def.fields.map((f) => ({ header: f.label, key: f.key, width: Math.max(16, f.label.length + 6) }));
  data.getRow(1).font = { bold: true };
  data.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF7" } };
  data.addRow(Object.fromEntries(def.fields.map((f) => [f.key, f.example])));
  // текстовый формат для кодов и дат, чтобы Excel не искажал значения
  for (const [i, f] of def.fields.entries()) {
    if (f.key === "employee_code" || f.key === "certificate_number" || f.key === "training") data.getColumn(i + 1).numFmt = "@";
  }

  const info = wb.addWorksheet("Инструкция");
  info.columns = [
    { header: "Колонка", key: "label", width: 28 },
    { header: "Обязательна", key: "req", width: 16 },
    { header: "Описание", key: "desc", width: 80 },
    { header: "Пример", key: "ex", width: 28 },
  ];
  info.getRow(1).font = { bold: true };
  for (const f of def.fields) {
    info.addRow({ label: f.label, req: f.required ? "да" : f.anyOf ? "ФИО или табельный №" : "нет", desc: f.description, ex: f.example });
  }
  info.addRow({});
  info.addRow({ label: "Как загружать", desc: "Заполните лист «Данные», сохраните файл и загрузите его в разделе «Импорт». Первая строка — заголовки; строку с примером удалите." });
  info.addRow({ label: "Ограничения", desc: "До 5000 строк и 5 МБ. Даты — ГГГГ-ММ-ДД или ДД.ММ.ГГГГ. Перед применением вы увидите предпросмотр и сможете отменить импорт." });
  if (entity === "PARTICIPANTS") info.addRow({ label: "Сотрудники", desc: "Сотрудники из списка участников не создаются. Если человека нет в справочнике, строка потребует решения." });
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
