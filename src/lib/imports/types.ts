/** Типы результатов, которыми обмениваются мастер и серверные действия. */
export type ParsedTable = {
  headers: string[];
  rows: { rowNo: number; cells: string[] }[];
  fileName: string;
  fileHash: string;
  source: "XLSX" | "CSV" | "PASTE" | "GSHEET";
  truncatedColumns?: boolean;
};

export type JobRowView = {
  id: number;
  row_no: number;
  status: string;
  messages: string[];
  review_code: string | null;
  data: Record<string, unknown>;
  candidates: { employee_id: string; full_name: string; match_kind: string; position: string | null; is_active: boolean }[];
  decision: string | null;
  decision_match: string | null;
  match_id: string | null;
  /** department_id, уже разрешённый в строке (для выбора департамента нового отдела) */
  dept_id?: number | null;
};
