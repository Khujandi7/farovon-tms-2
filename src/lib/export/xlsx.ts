import "server-only";
import ExcelJS from "exceljs";
import type { ExportColumn } from "./columns";
import { safeXlsxValue } from "./csv";
import type { ExportRow } from "./fetch";

/** XLSX: шапка жирная и закреплена, ширины колонок, даты как даты, числа как числа, строки защищены от формул. */
export async function buildXlsx(sheetName: string, columns: readonly ExportColumn[], rows: readonly ExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FAROVON TMS";
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true };
  head.alignment = { vertical: "middle", wrapText: true };
  head.height = 22;
  for (const r of rows) {
    ws.addRow(
      columns.map((c) => {
        const v = r[c.key];
        if (c.type === "date" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T00:00:00Z`);
        return safeXlsxValue(v);
      }),
    );
  }
  columns.forEach((c, i) => {
    if (c.type === "date") ws.getColumn(i + 1).numFmt = "dd.mm.yyyy";
  });
  if (rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
