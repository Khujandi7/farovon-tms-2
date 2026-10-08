"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/workflow/toast";
import { setGoogleSourceActive, syncGoogleSource } from "@/app/(app)/imports/google-actions";

export function SourceSyncButton({ id }: { id: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      onClick={() =>
        startTransition(async () => {
          const r = await syncGoogleSource({ id });
          notify(r.ok, r.ok ? (r.message ?? "Готово.") : r.error);
          if (r.ok && r.data.status === "NEEDS_REVIEW" && r.data.jobId) router.push(`/imports/${r.data.jobId}`);
          else router.refresh();
        })
      }
      disabled={pending}
      data-testid="gsheet-sync"
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} Синхронизировать сейчас
    </Button>
  );
}

export function SourceToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => startTransition(async () => { const r = await setGoogleSourceActive({ id, active: !active }); notify(r.ok, r.ok ? (r.message ?? "") : r.error); router.refresh(); })}>
      {active ? "Отключить" : "Включить"}
    </Button>
  );
}
