import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { SORT_COLUMN, type EmployeeListParams } from "./list-params";

type Client = SupabaseClient<Database>;

export const EMPLOYEE_SELECT =
  "id, canonical_id, employee_code, full_name, position, is_active, hire_date, termination_date, department:org_units!employees_department_id_fkey(name), unit:org_units!employees_unit_id_fkey(name)";

/** id сотрудников с открытыми замечаниями качества данных (RLS: видят ADMIN/ACADEMY_MANAGER/FINANCE/HR). Не больше 1000. */
export async function employeesWithOpenRemarks(supabase: Client): Promise<string[]> {
  const { data } = await supabase.from("dq_issues").select("entity_id").eq("entity_table", "employees").eq("status", "OPEN").limit(1000);
  return [...new Set((data ?? []).map((r) => r.entity_id).filter((v): v is string => !!v))];
}

/** Минимальный интерфейс цепочки PostgREST-запроса: фильтры списка и выгрузки общие, типы строк определяет вызывающий код. */
interface Chain {
  eq(c: string, v: unknown): Chain;
  or(f: string): Chain;
  in(c: string, v: unknown[]): Chain;
  order(c: string, o?: { ascending?: boolean; nullsFirst?: boolean }): Chain;
}

/** Применяет фильтры списка к запросу employees. remarkIds нужен только при p.remarks. */
export function applyEmployeeFilters<Q>(req: Q, p: EmployeeListParams, remarkIds: string[]): Q {
  let r = req as unknown as Chain;
  if (p.status !== "all") r = r.eq("is_active", p.status === "active");
  if (p.dept) r = r.eq("department_id", p.dept);
  if (p.unit) r = r.eq("unit_id", p.unit);
  if (p.q) r = r.or(`full_name.ilike.%${p.q}%,employee_code.ilike.%${p.q}%,canonical_id.ilike.%${p.q}%`);
  if (p.remarks) r = r.in("id", remarkIds.length ? remarkIds : ["00000000-0000-0000-0000-000000000000"]);
  return r as unknown as Q;
}

export function applyEmployeeSort<Q>(req: Q, p: EmployeeListParams): Q {
  let r = (req as unknown as Chain).order(SORT_COLUMN[p.sort], { ascending: p.dir === "asc", nullsFirst: false });
  if (p.sort !== "name") r = r.order("full_name", { ascending: true });
  return r.order("id") as unknown as Q;
}

export type EmployeeStats = { events: number; hours: number };

/** Мероприятий и часов по сотрудникам: посещённые участия в неархивных мероприятиях, часы — по карточке мероприятия (приблизительно; точная сводка — в досье). */
export async function fetchEmployeeStats(supabase: Client, ids: string[]): Promise<Map<string, EmployeeStats>> {
  const out = new Map<string, EmployeeStats>();
  const CHUNK = 120;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("training_participants")
        .select("employee_id, trainings!inner(hours, archived_at)")
        .in("employee_id", chunk)
        .eq("attended", true)
        .is("trainings.archived_at", null)
        .order("id")
        .range(from, from + 999);
      if (error || !data) break;
      for (const row of data) {
        const t = row.trainings as unknown as { hours: number | null } | null;
        const cur = out.get(row.employee_id) ?? { events: 0, hours: 0 };
        cur.events += 1;
        cur.hours += Number(t?.hours ?? 0);
        out.set(row.employee_id, cur);
      }
      if (data.length < 1000) break;
    }
  }
  return out;
}
