import { Target } from "lucide-react";
import { EmptyState, ErrorState } from "@/components/common/states";
import { GoalDialog } from "@/components/skills/goal-dialog";
import { Badge } from "@/components/ui/badge";
import type { AppRole } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";
import { GOAL_STATUS_LABELS, GOAL_TYPE_LABELS, goalStatusTone, groupGoalsByYear } from "@/lib/exams/dossier";
import { loadSkillOptions } from "@/lib/exams/options";

/** Вкладка «План развития»: цели по годам, статусы, создание и изменение целей. */
export async function GoalsTab({ employeeId, role }: { employeeId: string; role: AppRole }) {
  const supabase = await createClient();
  const canEdit = can(role, "goal");
  const [{ data, error }, skills] = await Promise.all([
    supabase.from("development_goals").select("id, plan_year, title, goal_type, status, due_date, skill_id, note").eq("employee_id", employeeId),
    canEdit ? loadSkillOptions(supabase) : Promise.resolve([]),
  ]);
  const groups = groupGoalsByYear(data ?? []);

  return (
    <section className="space-y-4" aria-label="План развития сотрудника" data-testid="goals-tab">
      {canEdit && (
        <div className="flex justify-end">
          <GoalDialog employeeId={employeeId} skills={skills} />
        </div>
      )}
      {error ? (
        <ErrorState className="bg-card" compact title="Не удалось загрузить цели" />
      ) : !groups.length ? (
        <EmptyState className="bg-card" compact icon={Target} title="План развития пуст" description="Цели добавляются по годам: тренинги, экзамены, сертификаты, навыки." />
      ) : (
        groups.map((g) => (
          <section key={g.year} aria-labelledby={`goals-${g.year}`} className="space-y-2">
            <h3 id={`goals-${g.year}`} className="text-sm font-semibold">{g.year}</h3>
            <ul className="space-y-2">
              {g.goals.map((goal) => (
                <li key={goal.id} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border bg-card p-3 text-sm" data-testid="goal-row">
                  <div className="min-w-0">
                    <p className="font-medium">{goal.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {GOAL_TYPE_LABELS[goal.goal_type as keyof typeof GOAL_TYPE_LABELS] ?? goal.goal_type}
                      {goal.due_date && ` · срок ${formatDate(goal.due_date)}`}
                      {goal.note && ` · ${goal.note}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={goalStatusTone(goal.status)}>{GOAL_STATUS_LABELS[goal.status as keyof typeof GOAL_STATUS_LABELS] ?? goal.status}</Badge>
                    {canEdit && <GoalDialog employeeId={employeeId} goal={goal} skills={skills} />}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </section>
  );
}
