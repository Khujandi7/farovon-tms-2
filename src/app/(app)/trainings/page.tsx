import type { Metadata } from "next";
import { SectionPage } from "@/components/common/section-page";
import { ErrorState } from "@/components/common/states";
import { TrainingsTable } from "@/components/trainings/trainings-table";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Обучения" };

export default function TrainingsPage() {
  return (
    <SectionPage section="trainings">
      {async () => {
        const supabase = await createClient();
        const { data, error } = await supabase
          .from("trainings")
          .select("id, canonical_id, title, start_date, end_date, hours, status, source_type, format")
          .is("archived_at", null)
          .order("start_date", { ascending: false })
          .limit(500);
        if (error) return <ErrorState className="bg-card" title="Не удалось загрузить обучения" description="Попробуйте обновить страницу." />;
        return <TrainingsTable data={data} />;
      }}
    </SectionPage>
  );
}
