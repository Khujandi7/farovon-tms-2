import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sortEvents, toEventRow, type EmployeeEventRow } from "@/lib/trainings/employee-events";

/** Все мероприятия, в которых сотрудник числится участником (RLS отдаёт только доступное роли). */
export async function loadEmployeeEvents(employeeId: string): Promise<{ rows: EmployeeEventRow[]; failed: boolean }> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("training_participants")
      .select(
        "id, result, attended, training:trainings!inner(id, canonical_id, title, start_date, end_date, hours, status, organizer, archived_at, event_type:learning_event_types(code, name), provider:learning_providers(name))",
      )
      .eq("employee_id", employeeId)
      .limit(2000);
    if (error) return { rows: [], failed: true };
    const rows = (data ?? []).map((r) => toEventRow(r)).filter((r): r is EmployeeEventRow => r !== null);
    return { rows: sortEvents(rows), failed: false };
  } catch {
    return { rows: [], failed: true };
  }
}
