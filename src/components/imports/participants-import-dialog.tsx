"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { commitImport, getImportSummary, stageImport, type ImportSummary } from "@/app/(app)/imports/actions";
import { autoMap, missingRequired } from "@/lib/imports/mapping";
import { buildStageRows, type StageRow } from "@/lib/imports/build";
import { namesTable, tableFromPastedText } from "@/lib/imports/paste";
import { sha256Hex } from "@/lib/imports/hash";
import { uploadForParsing } from "@/lib/imports/client";
import { MAX_ROWS, type SheetTable } from "@/lib/imports/table";

/**
 * Диалог «Импорт списка участников»: ФИО построчно (или таблица из Excel/Sheets) либо файл .xlsx/.csv.
 * Нажатие «Проверить» выполняет dry run (import_stage, options.training_id): сотрудники НЕ создаются, только сопоставляются.
 * Без спорных строк можно применить сразу в диалоге; иначе — решения на странице /imports/[id].
 */
export function ParticipantsImportDialog({ trainingId, canEdit }: { trainingId: string; canEdit: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [jobId, setJobId] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [reason, setReason] = useState("Импорт списка участников");
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function reset() {
    setText("");
    setError(undefined);
    setJobId(null);
    setSummary(null);
    setDone(null);
    if (fileRef.current) fileRef.current.value = "";
  }
  function close() {
    if (pending) return;
    setOpen(false);
    reset();
  }

  function analyze() {
    setError(undefined);
    start(async () => {
      let table: SheetTable;
      let source: "PASTE" | "XLSX" | "CSV" = "PASTE";
      let fileName = "Вставка списка участников";
      let fileHash: string | null = null;
      const file = fileRef.current?.files?.[0];
      if (file) {
        const r = await uploadForParsing(file);
        if (!r.ok) return setError(r.error);
        table = { headers: r.table.headers, rows: r.table.rows };
        source = r.table.source === "XLSX" ? "XLSX" : "CSV";
        fileName = r.table.fileName;
        fileHash = r.table.fileHash || null;
      } else {
        if (!text.trim()) return setError("Вставьте ФИО (по одному в строке) или выберите файл.");
        table = tableFromPastedText(text, "PARTICIPANTS");
        if (table.rows.length === 0) table = namesTable(text);
        fileHash = await sha256Hex(text);
      }
      if (table.rows.length === 0) return setError("Не найдено ни одной строки.");
      if (table.rows.length > MAX_ROWS) return setError("Не больше 5000 строк за раз.");
      const mapping = autoMap(table.headers, "PARTICIPANTS");
      const miss = missingRequired(mapping, "PARTICIPANTS");
      if (miss.length > 0) return setError("Не нашли колонку «ФИО» или «Табельный номер». Назовите колонки так или вставьте список ФИО построчно.");
      const built = buildStageRows(table, mapping, "PARTICIPANTS");
      const rows: StageRow[] = built.rows;
      if (rows.length === 0) return setError("Не найдено ни одной строки с ФИО.");
      const r = await stageImport({ entity: "PARTICIPANTS", source, fileName, fileHash, mapping, trainingId, rows });
      if (!r.ok) return setError(r.error);
      const s = await getImportSummary(r.data.jobId);
      setJobId(r.data.jobId);
      if (s.ok) setSummary(s.data);
      else setError(s.error);
    });
  }

  function apply() {
    if (!jobId) return;
    setError(undefined);
    start(async () => {
      const r = await commitImport({ jobId, reason });
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        setDone(r.message ?? "Импорт применён.");
        router.refresh();
      } else setError(r.error);
    });
  }

  if (!canEdit) return null;
  const canApplyHere = !!summary && summary.status === "STAGED" && summary.unresolved === 0;

  return (
    <>
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="import-participants">
        <ClipboardList aria-hidden="true" /> Импорт списка
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[92dvh] max-w-xl overflow-y-auto" data-testid="participants-import-dialog">
          <DialogHeader>
            <DialogTitle>Импорт списка участников</DialogTitle>
            <DialogDescription>Сотрудники сопоставляются со справочником. Нового сотрудника из списка создать нельзя: если человека нет в справочнике, строку нужно сопоставить или пропустить.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <FormAlert error={error} />
            {!summary && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="pi-text">ФИО (по одному в строке)</Label>
                  <Textarea id="pi-text" rows={7} value={text} onChange={(e) => setText(e.target.value)} disabled={pending} placeholder={"Иванов Иван Иванович\nПетрова Мария"} data-testid="participants-import-text" />
                  <p className="text-xs text-muted-foreground">Можно вставить и таблицу из Excel / Google Sheets с колонками «ФИО» и «Табельный номер».</p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pi-file">Или файл .xlsx / .csv (до 5 МБ)</Label>
                  <input id="pi-file" ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" disabled={pending} data-testid="participants-import-file" className="block w-full rounded-md border border-input bg-transparent p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium" />
                </div>
              </>
            )}
            {summary && (
              <div className="space-y-3" data-testid="participants-import-summary">
                <ul className="grid grid-cols-2 gap-2 text-sm">
                  <li className="rounded-lg border p-2">Всего строк: <b>{summary.total}</b></li>
                  <li className="rounded-lg border p-2">Будут добавлены: <b>{summary.newRows}</b></li>
                  <li className="rounded-lg border p-2">Уже участники: <b>{summary.unchanged}</b></li>
                  <li className="rounded-lg border p-2">Повторы в списке: <b>{summary.duplicates}</b></li>
                  <li className="rounded-lg border p-2">Требуют решения: <b>{summary.review}</b></li>
                  <li className="rounded-lg border p-2">Ошибки: <b>{summary.errors}</b></li>
                </ul>
                {done ? (
                  <p role="status" className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm">{done}</p>
                ) : canApplyHere ? (
                  <div className="grid gap-2">
                    <Label htmlFor="pi-reason">Причина (сохраняется в журнале)</Label>
                    <Input id="pi-reason" value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Есть строки, которые требуют решения. Откройте результат импорта, чтобы сопоставить их со справочником или пропустить, и примените импорт там.</p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close} disabled={pending}>{done ? "Закрыть" : "Отмена"}</Button>
            {!summary && (
              <Button type="button" onClick={analyze} disabled={pending} data-testid="participants-import-analyze">
                {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Проверить
              </Button>
            )}
            {summary && jobId && !done && (
              <>
                <Button asChild variant="outline"><Link href={`/imports/${jobId}`} data-testid="participants-import-open">Открыть результат</Link></Button>
                {canApplyHere && (
                  <Button type="button" onClick={apply} disabled={pending || reason.trim().length < 3} data-testid="participants-import-apply">
                    {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Применить
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
