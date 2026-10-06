import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AuditLookup, AuditRow } from "./describe";

type Client = SupabaseClient<Database>;

/** Собирает подписи для идентификаторов из записей аудита: сотрудники, участники, заходы, заявки, статьи расходов. */
export async function buildAuditLookup(supabase: Client, rows: AuditRow[]): Promise<AuditLookup> {
  const employeeIds = new Set<string>();
  const participantEmployee = new Map<string, string>();
  const sessionIds = new Set<string>();
  const requestIds = new Set<string>();
  const sessionNo = new Map<string, number>();

  for (const row of rows) {
    for (const r of [row.old_row, row.new_row]) {
      if (!r) continue;
      if (typeof r.employee_id === "string") employeeIds.add(r.employee_id);
      if (row.table_name === "training_participants" && typeof r.id === "string" && typeof r.employee_id === "string") participantEmployee.set(r.id, r.employee_id);
      if (typeof r.session_id === "string") sessionIds.add(r.session_id);
      if (row.table_name === "training_sessions" && typeof r.id === "string" && typeof r.session_no === "number") sessionNo.set(r.id, r.session_no);
      if (typeof r.request_id === "string") requestIds.add(r.request_id);
    }
  }
  const missingParticipants = rows
    .map((r) => (r.table_name === "session_attendance" ? (r.new_row ?? r.old_row)?.participant_id : null))
    .filter((id): id is string => typeof id === "string" && !participantEmployee.has(id));

  if (missingParticipants.length) {
    const { data } = await supabase.from("training_participants").select("id, employee_id").in("id", [...new Set(missingParticipants)]);
    for (const p of data ?? []) {
      participantEmployee.set(p.id, p.employee_id);
      employeeIds.add(p.employee_id);
    }
  }

  const [emps, sessions, requests, cats] = await Promise.all([
    employeeIds.size ? supabase.from("employees").select("id, full_name").in("id", [...employeeIds]) : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
    sessionIds.size ? supabase.from("training_sessions").select("id, session_no").in("id", [...sessionIds]) : Promise.resolve({ data: [] as { id: string; session_no: number }[] }),
    requestIds.size ? supabase.from("training_requests").select("id, canonical_id").in("id", [...requestIds]) : Promise.resolve({ data: [] as { id: string; canonical_id: string }[] }),
    supabase.from("expense_categories").select("id, name"),
  ]);

  const employees = Object.fromEntries((emps.data ?? []).map((e) => [e.id, e.full_name]));
  for (const s of sessions.data ?? []) sessionNo.set(s.id, s.session_no);
  return {
    employees,
    participants: Object.fromEntries([...participantEmployee].map(([pid, eid]) => [pid, employees[eid] ?? "участник"])),
    sessions: Object.fromEntries([...sessionNo].map(([id, n]) => [id, `Заход ${n}`])),
    requests: Object.fromEntries((requests.data ?? []).map((r) => [r.id, r.canonical_id])),
    categories: Object.fromEntries((cats.data ?? []).map((c) => [String(c.id), c.name])),
  };
}
