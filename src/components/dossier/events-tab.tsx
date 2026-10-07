import { ErrorState } from "@/components/common/states";
import { EventsList } from "@/components/dossier/events-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppRole } from "@/lib/auth/roles";
import { loadEmployeeEvents } from "@/lib/trainings/load-employee-events";

/** Вкладка «Мероприятия»: обучения, семинары, форумы, конференции и т. д., где сотрудник числится участником. */
export async function EventsTab({ employeeId, role }: { employeeId: string; role: AppRole }) {
  void role; // состав строк определяет RLS; сумм на вкладке нет
  const { rows, failed } = await loadEmployeeEvents(employeeId);
  if (failed) return <ErrorState className="bg-card" title="Не удалось загрузить мероприятия" description="Попробуйте обновить страницу." />;
  return (
    <Card data-testid="events-tab">
      <CardHeader>
        <CardTitle>Мероприятия</CardTitle>
        <CardDescription>Все мероприятия сотрудника: обучения, семинары, форумы, конференции. Отфильтруйте по типу.</CardDescription>
      </CardHeader>
      <CardContent>{rows.length === 0 ? <p className="text-sm text-muted-foreground">Мероприятий пока нет.</p> : <EventsList rows={rows} />}</CardContent>
    </Card>
  );
}
