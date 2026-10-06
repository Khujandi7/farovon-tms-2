"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { linkRequest } from "@/app/(app)/trainings/actions";

export type LinkedRequest = { id: string; code: string; topic: string; year: number } | null;
export type RequestChoice = { id: string; label: string };

/** Связь тренинга с заявкой: «Связать» / «Сменить» / «Отвязать». Для внепланового тренинга привязка требует явного подтверждения. */
export function RequestLinkPanel({
  trainingId,
  sourceType,
  linked,
  options,
  canEdit,
}: {
  trainingId: string;
  sourceType: "PLANNED" | "UNPLANNED";
  linked: LinkedRequest;
  options: RequestChoice[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"link" | "unlink" | null>(null);
  const [choice, setChoice] = useState("");
  const [confirmUnplanned, setConfirmUnplanned] = useState(false);

  return (
    <div className="rounded-lg border bg-card p-3 text-sm shadow-xs" data-testid="request-link">
      <p className="text-xs text-muted-foreground">Заявка</p>
      {linked ? (
        <p className="mt-0.5">
          <Link href={`/trainings/requests/${linked.id}`} className="font-medium hover:text-brand hover:underline">
            {linked.code}
          </Link>{" "}
          · {linked.year} · {linked.topic}
        </p>
      ) : (
        <p className="mt-0.5 text-muted-foreground">Не привязана{sourceType === "UNPLANNED" ? " (внеплановый тренинг)" : ""}</p>
      )}
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => { setChoice(""); setConfirmUnplanned(false); setMode("link"); }} data-testid="link-request">
            <Link2 aria-hidden="true" /> {linked ? "Сменить заявку" : "Связать с заявкой"}
          </Button>
          {linked && (
            <Button type="button" size="sm" variant="outline" onClick={() => setMode("unlink")} data-testid="unlink-request">
              <Unlink aria-hidden="true" /> Отвязать
            </Button>
          )}
        </div>
      )}

      <ReasonDialog
        open={mode === "link"}
        title="Связать с заявкой"
        description="Тренинг с заявкой считается плановым. Это изменение попадёт в журнал."
        confirmLabel="Связать"
        testId="link-dialog"
        onClose={() => setMode(null)}
        onConfirm={(reason) => {
          if (!choice) return Promise.resolve({ ok: false as const, error: "Выберите заявку." });
          if (sourceType === "UNPLANNED" && !confirmUnplanned) return Promise.resolve({ ok: false as const, error: "Подтвердите перевод внепланового тренинга в плановые." });
          return linkRequest({ trainingId, requestId: choice, sourceType: "PLANNED", confirm: confirmUnplanned || sourceType === "PLANNED", reason });
        }}
        onDone={() => router.refresh()}
      >
        <div className="grid gap-2">
          <Label htmlFor="link-request-select">Заявка</Label>
          <Select id="link-request-select" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">— выберите —</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </Select>
        </div>
        {sourceType === "UNPLANNED" && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={confirmUnplanned} onChange={(e) => setConfirmUnplanned(e.target.checked)} />
            <span>Подтверждаю: тренинг был внеплановым, но фактически проводился по этой заявке — переводим его в плановые.</span>
          </label>
        )}
      </ReasonDialog>

      <ReasonDialog
        open={mode === "unlink"}
        title="Отвязать заявку"
        description="Тренинг станет внеплановым. Заявка останется в системе."
        confirmLabel="Отвязать"
        destructive
        testId="unlink-dialog"
        onClose={() => setMode(null)}
        onConfirm={(reason) => linkRequest({ trainingId, requestId: null, reason })}
        onDone={() => router.refresh()}
      />
    </div>
  );
}
