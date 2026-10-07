import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { ProviderOption, SkillOption } from "@/components/exams/new-exam-dialog";

type Client = SupabaseClient<Database>;

export async function loadSkillOptions(supabase: Client, opts: { onlyActive?: boolean } = {}): Promise<(SkillOption & { is_active: boolean })[]> {
  let q = supabase.from("skills").select("id, name, kind, is_active").order("name");
  if (opts.onlyActive !== false) q = q.eq("is_active", true);
  const { data } = await q;
  return (data ?? []).map((s) => ({ id: s.id, name: s.name, kind: s.kind, is_active: s.is_active }));
}

export async function loadProviderOptions(supabase: Client): Promise<ProviderOption[]> {
  const { data } = await supabase.from("learning_providers").select("id, name").eq("is_active", true).order("name");
  return (data ?? []).map((p) => ({ id: p.id, name: p.name }));
}
