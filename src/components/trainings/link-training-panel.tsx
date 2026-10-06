"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { linkRequest } from "@/app/(app)/trainings/actions";
import { TRAINING_STATUS_LABELS, TRAINING_STATUS_VARIANT } from "@/lib/labels";
import { formatDateRange, formatNumber } from "@/lib/format";
import type { Database } from "@/types/database";

export type LinkedTraining = { id: string; canonical_id: string; title: string; start_date: string; end_date: string; status: Database["public"]["Enums"]["training_status"]; participants: number };
export type TrainingChoice = { id: string; label: string };

/** Со стороны заявки: список привязанных тренингов, «Связать тренинг» и «Отвязать». План (участники по заявке) показан рядом с фактом. */
export function LinkTrainingPanel({ requestId, plannedParticipants, trainings, choices, canEdit }: { requestId: string; plannedParticipants: number | null; trainings: LinkedTraining[]; choices: TrainingChoice[]; canEdit: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | LinkedTraining | null>(null);
  const [choice, setChoice] = useState("");
  const fact = trainings.reduce((n, t) => n + t.participants, 0);

  return (
    <div className="space-y-3" data-testid="link-training-panel">
      <p className="text-sm">
        План: <strong>{plannedParticipants === null ? "—" : formatNumber(plannedParticipants)}</strong> участников · Факт по привязанным тренингам: <strong data-testid="request-fact">{formatNumber(fact)}</strong>
        {plannedParticipants !== null && trainings.length > 0 && plannedParticipants !== fact && <Badge variant="warning" className="ml-2">расхождение {fact - plannedParticipants > 0 ? "+" : ""}{fact - plannedParticipants}</Badge>}
      </p>
      {trainings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Тренинг ещё не привязан.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {trainings.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="linked-training">
              <div className="min-w-0">
                <Link href={`/trainings/${t.id}`} className="font-medium hover:text-brand hover:underline">{t.canonical_id} · {t.title}</Link>
                <p className="text-xs text-muted-foreground">{formatDateRange(t.start_date, t.end_date)} · участников {t.participants}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={TRAINING_STATUS_VARIANT[t.status]}>{TRAINING_STATUS_LABELS[t.status]}</Badge>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => setMode(t)} aria-label={`Отвязать ${t.canonical_id}`}>
                    <Unlink aria-hidden="true" /> Отвязать
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <Button size="sm" variant="outline" onClick={() => { setChoice(""); setMode("link"); }} data-testid="link-training">
          <Link2 aria-hidden="true" /> Связать тренинг
        </Button>
      )}

      <ReasonDialog
        open={mode === "link"}
        title="Связать тренинг с заявкой"
        description="Тренинг станет плановым. Показаны тренинги без заявки."
        confirmLabel="Связать"
        testId="link-training-dialog"
        onClose={() => setMode(null)}
        onConfirm={(reason) => (choice ? linkRequest({ trainingId: choice, requestId, sourceType: "PLANNED", confirm: true, reason }) : Promise.resolve({ ok: false as const, error: "Выберите тренинг." }))}
        onDone={() => router.refresh()}
      >
        <div className="grid gap-2">
          <Label htmlFor="link-training-select">Тренинг</Label>
          <Select id="link-training-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">— выберите —</option>
            {choices.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </Select>
        </div>
      </ReasonDialog>
      <ReasonDialog
        open={mode !== null && mode !== "link"}
        title="Отвязать тренинг"
        description="Тренинг станет внеплановым. Заявка останется."
        confirmLabel="Отвязать"
        destructive
        testId="unlink-training-dialog"
        onClose={() => setMode(null)}
        onConfirm={(reason) => linkRequest({ trainingId: mode && mode !== "link" ? mode.id : "", requestId: null, reason })}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
