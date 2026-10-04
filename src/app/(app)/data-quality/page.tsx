import type { Metadata } from "next";
import { ClipboardCheck } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState } from "@/components/common/states";

export const metadata: Metadata = { title: "Качество данных" };

export default function Page() {
  return (
    <SectionPage section="data-quality">
      {() => <EmptyState className="bg-card" icon={ClipboardCheck} title="Раздел в разработке" description="Проверки и журнал замечаний появятся на этапе Phase 2.11." />}
    </SectionPage>
  );
}
