import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { PickEmployee, PickUnit } from "./participant-filter";

type Client = Awaited<ReturnType<typeof createClient>>;
const PAGE = 1000; // PostgREST в Supabase по умолчанию отдаёт не больше 1000 строк за запрос

/**
 * Активные сотрудники справочника для выбора участников (под правами пользователя — RLS).
 * Только поля для выбора: ФИО, табельный номер, должность, подразделение. Контакты (телефон, email) не загружаются.
 */
export async function loadPickableEmployees(supabase: Client, max = 10_000): Promise<PickEmployee[]> {
  const out: PickEmployee[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await supabase
      .from("employees")
      .select("id, full_name, employee_code, position, department_id, unit_id")
      .eq("is_active", true)
      .order("full_name")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    out.push(...data.map((e) => ({ id: e.id, full_name: e.full_name, employee_code: e.employee_code, position: e.position, department_id: e.department_id, unit_id: e.unit_id })));
    if (data.length < PAGE) break;
  }
  return out;
}

export async function loadPickUnits(supabase: Client): Promise<PickUnit[]> {
  const { data } = await supabase.from("org_units").select("id, name, level, parent_id").eq("is_active", true).order("name").limit(2000);
  return (data ?? []).map((u) => ({ id: u.id, name: u.name, level: u.level, parent_id: u.parent_id }));
}
