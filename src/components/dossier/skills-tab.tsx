import { Sparkles } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/states";
import { AddSkillLevelDialog } from "@/components/skills/add-skill-level-dialog";
import { SkillsDictionaryDialog } from "@/components/skills/skills-dictionary-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppRole } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";
import { SKILL_SOURCE_LABELS, currentSkillEntries } from "@/lib/exams/dossier";
import { SKILL_KIND_LABELS } from "@/lib/exams/format";
import { loadSkillOptions } from "@/lib/exams/options";

/** Вкладка «Навыки»: актуальные уровни, история (только добавление), справочник навыков для ролей skill. */
export async function SkillsTab({ employeeId, role }: { employeeId: string; role: AppRole }) {
  const supabase = await createClient();
  const canEdit = can(role, "skill");
  const [{ data, error }, allSkills] = await Promise.all([
    supabase.from("employee_skills").select("id, skill_id, level, achieved_on, source, note, created_at").eq("employee_id", employeeId).order("achieved_on", { ascending: false }).order("created_at", { ascending: false }),
    loadSkillOptions(supabase, { onlyActive: false }),
  ]);
  const names = new Map(allSkills.map((s) => [s.id, s]));
  const history = data ?? [];
  const current = currentSkillEntries(history).sort((a, b) => (names.get(a.skill_id)?.name ?? "").localeCompare(names.get(b.skill_id)?.name ?? "", "ru"));
  const active = allSkills.filter((s) => s.is_active);

  return (
    <section className="space-y-4" aria-label="Навыки сотрудника" data-testid="skills-tab">
      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          <SkillsDictionaryDialog skills={allSkills} />
          <AddSkillLevelDialog employeeId={employeeId} skills={active} />
        </div>
      )}
      {error ? (
        <ErrorState className="bg-card" compact title="Не удалось загрузить навыки" />
      ) : !history.length ? (
        <EmptyState className="bg-card" compact icon={Sparkles} title="Навыков пока нет" description="Добавьте первый навык или квалификацию с уровнем." />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Текущие навыки и квалификации</CardTitle>
              <CardDescription>Актуальный уровень — последняя запись по каждому навыку.</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2" data-testid="skills-current">
                {current.map((c) => {
                  const s = names.get(c.skill_id);
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                      <span className="min-w-0">
                        <span className="block font-medium">{s?.name ?? "Навык"}</span>
                        <span className="block text-xs text-muted-foreground">{SKILL_KIND_LABELS[(s?.kind ?? "SKILL") as keyof typeof SKILL_KIND_LABELS] ?? ""} · с {formatDate(c.achieved_on)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant="brand">{c.level}</Badge>
                        {canEdit && s?.is_active && <AddSkillLevelDialog employeeId={employeeId} skills={active} presetSkillId={c.skill_id} />}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
          <section aria-labelledby="skills-history" className="space-y-2">
            <h3 id="skills-history" className="text-sm font-semibold">История уровней</h3>
            <ol className="space-y-2" data-testid="skills-history">
              {history.map((h) => (
                <li key={h.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-lg border bg-card px-3 py-2 text-sm">
                  <span><span className="font-medium">{names.get(h.skill_id)?.name ?? "Навык"}</span> — {h.level}</span>
                  <span className="text-xs text-muted-foreground">{formatDate(h.achieved_on)} · {SKILL_SOURCE_LABELS[h.source] ?? h.source}{h.note ? ` · ${h.note}` : ""}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </section>
  );
}
