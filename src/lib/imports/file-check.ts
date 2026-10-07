import { MAX_FILE_BYTES } from "./table";
import type { ImportSource } from "./entities";

export type FileKind = "xlsx" | "text";
export type FileCheck = { ok: true; kind: FileKind; source: ImportSource } | { ok: false; error: string };

const XLSX_EXT = [".xlsx"];
const TEXT_EXT = [".csv", ".tsv", ".txt"];

/** Проверка расширения, размера и сигнатуры. Старые .xls и макросы (.xlsm) не принимаются. */
export function checkUpload(fileName: string, bytes: Uint8Array): FileCheck {
  const name = fileName.toLowerCase();
  if (bytes.byteLength === 0) return { ok: false, error: "Файл пустой." };
  if (bytes.byteLength > MAX_FILE_BYTES) return { ok: false, error: "Файл больше 5 МБ." };
  if (XLSX_EXT.some((e) => name.endsWith(e))) {
    // zip: PK\x03\x04
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return { ok: true, kind: "xlsx", source: "XLSX" };
    return { ok: false, error: "Файл повреждён или не является книгой Excel (.xlsx)." };
  }
  if (TEXT_EXT.some((e) => name.endsWith(e))) {
    const head = bytes.subarray(0, Math.min(bytes.length, 4096));
    if (head.includes(0)) return { ok: false, error: "Файл не похож на текстовую таблицу." };
    if (bytes[0] === 0x50 && bytes[1] === 0x4b) return { ok: false, error: "Это архив, а не CSV. Сохраните таблицу как .xlsx или .csv." };
    return { ok: true, kind: "text", source: "CSV" };
  }
  return { ok: false, error: "Допустимые форматы: .xlsx, .csv, .tsv, .txt." };
}

/** Декодирование текста: UTF-8 (с BOM или без); при ошибках — windows-1251 (частый случай для CSV из Excel). */
export function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder("windows-1251").decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}
