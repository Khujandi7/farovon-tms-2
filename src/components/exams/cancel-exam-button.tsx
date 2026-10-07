"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { cancelExam } from "@/app/(app)/exams/actions";

export function CancelExamButton({ examId }: { examId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="cancel-exam">
        <Ban aria-hidden="true" /> Отменить экзамен
      </Button>
      <ReasonDialog
        open={open}
        title="Отменить экзамен"
        description="Запись останется в истории со статусом «Отменён». Результат после отмены внести нельзя."
        confirmLabel="Отменить экзамен"
        destructive
        testId="cancel-exam-dialog"
        onClose={() => setOpen(false)}
        onConfirm={(reason) => cancelExam({ id: examId, reason })}
        onDone={() => router.refresh()}
      />
    </>
  );
}
