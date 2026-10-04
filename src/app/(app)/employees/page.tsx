import type { Metadata } from "next";
import { Users } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState } from "@/components/common/states";

export const metadata: Metadata = { title: "Сотрудники" };

export default function Page() {
  return (
    <SectionPage section="employees">
      {() => <EmptyState className="bg-card" icon={Users} title="Раздел в разработке" description="Справочник сотрудников и досье обучения появятся на этапе Phase 2.6." />}
    </SectionPage>
  );
}
