import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/states";

/** Карточка диаграммы. Пока база не отдаёт помесячные ряды, показывает честное пустое состояние. */
export function ChartCard({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {children ?? (
          <EmptyState
            compact
            icon={BarChart3}
            className="min-h-48"
            title="Диаграмма пока недоступна"
            description="Помесячные данные будут рассчитываться базой и появятся в следующем обновлении."
          />
        )}
      </CardContent>
    </Card>
  );
}
