"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/workflow/toast";
import { exportHref } from "@/lib/export/href";

export type ExportEntityName = "employees" | "trainings" | "exams" | "certificates" | "participants" | "agreements";

/**
 * Кнопка выгрузки CSV/Excel. params — текущие фильтры списка (как в URL), для participants обязателен training_id.
 * Файл формирует сервер под сессией пользователя; при отказе показываем сообщение, страница не уходит.
 */
export function ExportButton({ entity, params, label = "Экспорт" }: { entity: ExportEntityName; params?: Record<string, string | number | null | undefined>; label?: string }) {
  const { notify } = useToast();
  const [busy, setBusy] = useState(false);

  async function download(format: "csv" | "xlsx") {
    setBusy(true);
    try {
      const res = await fetch(exportHref(entity, format, params), { credentials: "same-origin" });
      if (!res.ok) {
        let msg = "Не удалось выгрузить файл.";
        try {
          msg = ((await res.json()) as { error?: string }).error ?? msg;
        } catch {
          /* ответ не JSON */
        }
        notify(false, msg);
        return;
      }
      const blob = await res.blob();
      const m = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = m?.[1] ?? `export.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      notify(true, res.headers.get("X-Export-Truncated") === "1" ? "Файл сформирован, но обрезан до 20 000 строк. Уточните фильтры." : "Файл сформирован.");
    } catch {
      notify(false, "Не удалось выгрузить файл. Проверьте соединение.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" disabled={busy} data-testid={`export-button-${entity}`} className="min-h-10">
          {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download aria-hidden="true" />}
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void download("xlsx")} data-testid="export-xlsx">
          <FileSpreadsheet aria-hidden="true" /> Excel (.xlsx)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void download("csv")} data-testid="export-csv">
          <FileText aria-hidden="true" /> CSV (для Excel)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
