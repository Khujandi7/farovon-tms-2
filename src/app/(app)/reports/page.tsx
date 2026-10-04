import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState } from "@/components/common/states";

export const metadata: Metadata = { title: "Отчёты" };

export default function Page() {
  return (
    <SectionPage section="reports">
      {() => <EmptyState className="bg-card" icon={BarChart3} title="Раздел в разработке" description="Отчёты и выгрузки появятся на этапе Phase 2.9. Все суммы в отчётах рассчитывает база." />}
    </SectionPage>
  );
}
