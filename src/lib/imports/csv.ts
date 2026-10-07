/** Разбор CSV/TSV/вставки: разделители , ; \t, кавычки (RFC 4180), BOM. Чистая функция, без зависимостей. */

export type Delimiter = "," | ";" | "\t";

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Выбор разделителя по первым строкам вне кавычек: табуляция > точка с запятой > запятая по числу вхождений. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ",": 0, ";": 0, "\t": 0 };
  let inQuotes = false;
  let lines = 0;
  for (let i = 0; i < text.length && lines < 5; i++) {
    const ch = text[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes) {
      if (ch === "\n") lines++;
      else if (ch === "," || ch === ";" || ch === "\t") counts[ch]++;
    }
  }
  if (counts["\t"] > 0 && counts["\t"] >= counts[";"] && counts["\t"] >= counts[","]) return "\t";
  if (counts[";"] > 0 && counts[";"] >= counts[","]) return ";";
  return ",";
}

export function parseCsv(input: string, delimiter?: Delimiter): string[][] {
  const text = stripBom(input);
  const delim = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let touched = false;
  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    touched = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") {
      inQuotes = true;
      touched = true;
    } else if (ch === delim) {
      endField();
      touched = true;
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else {
      field += ch;
      touched = true;
    }
  }
  if (touched || field !== "" || row.length > 0) endRow();
  return rows;
}

/** Вставка из буфера (Google Sheets/Excel дают табуляции). Та же логика, что и у CSV. */
export function parsePasted(text: string): string[][] {
  return parseCsv(text);
}
