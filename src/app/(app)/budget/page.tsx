import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState } from "@/components/common/states";

export const metadata: Metadata = { title: "Бюджет" };

export default function Page() {
  return (
    <SectionPage section="budget">
      {() => <EmptyState className="bg-card" icon={Wallet} title="Раздел в разработке" description="Версии бюджета, ревизии и расходы появятся на этапе Phase 2.7. Утверждённый бюджет неизменяем: изменения только через ревизию." />}
    </SectionPage>
  );
}
