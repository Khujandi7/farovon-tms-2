"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { archiveTraining } from "@/app/(app)/trainings/actions";
import { archiveRequest } from "@/app/(app)/trainings/requests/actions";

/** Логическое удаление (архив) и восстановление. Физически записи не удаляются: история и расходы сохраняются. */
export function ArchiveButton({ entity, id, archived, subject }: { entity: "training" | "request"; id: string; archived: boolean; subject: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const run = (reason: string) => (entity === "training" ? archiveTraining({ id, archived: !archived, reason }) : archiveRequest({ id, archived: !archived, reason }));
  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="archive-button">
        {archived ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
        {archived ? "Восстановить" : "В архив"}
      </Button>
      <ReasonDialog
        open={open}
        title={archived ? `Восстановить: ${subject}` : `В архив: ${subject}`}
        description={archived ? "Запись снова станет доступной для редактирования." : "Запись скроется из списков и станет недоступной для правок. Данные не удаляются, восстановить можно в любой момент."}
        confirmLabel={archived ? "Восстановить" : "Перенести в архив"}
        destructive={!archived}
        testId="archive-dialog"
        onClose={() => setOpen(false)}
        onConfirm={run}
        onDone={() => router.refresh()}
      />
    </>
  );
}
