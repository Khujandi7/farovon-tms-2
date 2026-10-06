"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/workflow/toast";
import { runDqScan } from "@/app/(app)/data-quality/actions";

export function ScanButton() {
  const router = useRouter();
  const { notify } = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      data-testid="dq-scan"
      onClick={() =>
        start(async () => {
          const r = await runDqScan();
          notify(r.ok, r.ok ? `Проверка выполнена: новых ${r.data.opened}, закрыто автоматически ${r.data.autoFixed}, открытых ${r.data.totalOpen}.` : r.error);
          if (r.ok) router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />} Проверить сейчас
    </Button>
  );
}
