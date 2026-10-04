import type { Metadata } from "next";
import { MessageSquareText } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState } from "@/components/common/states";

export const metadata: Metadata = { title: "Обратная связь" };

export default function Page() {
  return (
    <SectionPage section="feedback">
      {() => <EmptyState className="bg-card" icon={MessageSquareText} title="Раздел в разработке" description="Агрегированные оценки тренингов появятся на этапе Phase 2.8. Личность респондентов не отображается." />}
    </SectionPage>
  );
}
