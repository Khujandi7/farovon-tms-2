import "server-only";
import { createClient } from "@/lib/supabase/server";

export type EventTypeOption = { id: number; code: string; name: string; is_group: boolean; is_active: boolean };
export type ProviderOption = { id: string; name: string; kind: string; is_active: boolean };

/** Справочники для форм и фильтров. При ошибке (например, миграции не применены) возвращает пустые списки. */
export async function loadEventTypes(opts: { includeInactive?: boolean } = {}): Promise<EventTypeOption[]> {
  try {
    const supabase = await createClient();
    let q = supabase.from("learning_event_types").select("id, code, name, is_group, is_active").order("sort_order").order("name");
    if (!opts.includeInactive) q = q.eq("is_active", true);
    const { data } = await q;
    return data ?? [];
  } catch {
    return [];
  }
}

export async function loadProviders(opts: { includeInactive?: boolean } = {}): Promise<ProviderOption[]> {
  try {
    const supabase = await createClient();
    let q = supabase.from("learning_providers").select("id, name, kind, is_active").order("name");
    if (!opts.includeInactive) q = q.eq("is_active", true);
    const { data } = await q;
    return data ?? [];
  } catch {
    return [];
  }
}
