"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FileUp, Loader2, ClipboardPaste, Sheet as SheetIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { stageImport } from "@/app/(app)/imports/actions";
import { saveGoogleSource } from "@/app/(app)/imports/google-actions";
import { ENTITY_DEFS, type ImportEntity } from "@/lib/imports/entities";
import { autoMap, missingRequired, type ColumnMapping } from "@/lib/imports/mapping";
import { buildStageRows } from "@/lib/imports/build";
import { validateRows } from "@/lib/imports/validate";
import { tableFromPastedText } from "@/lib/imports/paste";
import { sha256Hex } from "@/lib/imports/hash";
import { MAX_ROWS } from "@/lib/imports/table";
import { uploadForParsing } from "@/lib/imports/client";
import type { ParsedTable } from "@/lib/imports/types";
import { ImportStepper, type ImportStepId } from "./import-stepper";
import { GoogleSheetPicker, type GoogleSheetMeta } from "./google-sheet-picker";

export type TrainingChoice = { id: string; label: string };
type Mode = "file" | "paste" | "gsheet";

/**
 * Мастер импорта: загрузка → предпросмотр → колонки → проверка → (качество данных + dry run на странице задачи) → применение.
 * Шаги DQ / Dry run / Commit выполняются на /imports/[id]: до применения в БД пишутся только import_jobs и import_job_rows.
 */
export function ImportWizard({ entities, initialEntity, trainings = [], initialTrainingId }: { entities: ImportEntity[]; initialEntity: ImportEntity; trainings?: TrainingChoice[]; initialTrainingId?: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [entity, setEntity] = useState<ImportEntity>(initialEntity);
  const [trainingId, setTrainingId] = useState(initialTrainingId ?? "");
  const [mode, setMode] = useState<Mode>("file");
  const [pasted, setPasted] = useState("");
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [step, setStep] = useState<"upload" | "preview" | "mapping" | "validation">("upload");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<GoogleSheetMeta | null>(null);
  const [saveSource, setSaveSource] = useState(true);
  const [sourceName, setSourceName] = useState("");

  const def = ENTITY_DEFS[entity];
  const missing = useMemo(() => missingRequired(mapping, entity), [mapping, entity]);
  const built = useMemo(() => (table ? buildStageRows({ headers: table.headers, rows: table.rows }, mapping, entity) : null), [table, mapping, entity]);
  const validation = useMemo(() => (built ? validateRows(built.rows, entity) : null), [built, entity]);

  function changeEntity(e: ImportEntity) {
    setEntity(e);
    if (table) setMapping(autoMap(table.headers, e));
  }

  function accept(t: ParsedTable) {
    if (t.rows.length > MAX_ROWS) return setError("Не больше 5000 строк за раз.");
    setTable(t);
    setMapping(autoMap(t.headers, entity));
    setStep("preview");
  }

  async function onContinueUpload() {
    setError(undefined);
    if (entity === "PARTICIPANTS" && !trainingId) return setError("Выберите мероприятие, в которое импортируются участники.");
    setBusy(true);
    try {
      if (mode === "file") {
        const f = fileRef.current?.files?.[0];
        if (!f) return setError("Выберите файл .xlsx, .csv, .tsv или .txt.");
        const r = await uploadForParsing(f);
        if (!r.ok) return setError(r.error);
        accept(r.table);
      } else {
        if (!pasted.trim()) return setError("Вставьте таблицу из буфера обмена.");
        if (pasted.length > 5 * 1024 * 1024) return setError("Текст больше 5 МБ.");
        const t = tableFromPastedText(pasted, entity);
        if (t.rows.length === 0) return setError("В тексте нет строк с данными.");
        accept({ ...t, fileName: "Вставка из буфера", fileHash: await sha256Hex(pasted), source: "PASTE" });
      }
    } finally {
      setBusy(false);
    }
  }

  function runDry() {
    if (!table || !built) return;
    setError(undefined);
    startTransition(async () => {
      let sourceId: string | null = null;
      if (table.source === "GSHEET" && sheet && entity === "EMPLOYEES" && saveSource) {
        const saved = await saveGoogleSource({ url: sheet.url, tab: sheet.tab, name: sourceName.trim() || `${sheet.title} / ${sheet.tab}`, headerRow: sheet.headerRow, mapping, headers: table.headers });
        if (!saved.ok) return setError(saved.error);
        sourceId = saved.data.id;
      }
      const r = await stageImport({
        sourceId,
        entity,
        source: table.source,
        fileName: table.fileName,
        fileHash: table.fileHash || null,
        mapping,
        trainingId: entity === "PARTICIPANTS" ? trainingId : null,
        rows: built.rows,
      });
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        router.push(`/imports/${r.data.jobId}`);
      } else setError(r.error);
    });
  }

  const current: ImportStepId = step === "upload" ? "upload" : step === "preview" ? "preview" : step === "mapping" ? "mapping" : "validation";

  return (
    <div className="space-y-5" data-testid="import-wizard">
      <ImportStepper current={current} />
      <FormAlert error={error} />

      {step === "upload" && (
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-labelledby="wiz-upload">
          <h2 id="wiz-upload" className="font-medium">Что и откуда загружаем</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="imp-entity">Что импортируем</Label>
              <Select id="imp-entity" value={entity} onChange={(e) => changeEntity(e.target.value as ImportEntity)} disabled={entities.length < 2} data-testid="import-entity">
                {entities.map((e) => (
                  <option key={e} value={e}>{ENTITY_DEFS[e].title}</option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">{def.description}</p>
            </div>
            {entity === "PARTICIPANTS" && (
              <div className="grid gap-2">
                <Label htmlFor="imp-training">Мероприятие</Label>
                <Select id="imp-training" value={trainingId} onChange={(e) => setTrainingId(e.target.value)} data-testid="import-training">
                  <option value="">— выберите —</option>
                  {trainings.map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <div role="tablist" aria-label="Источник данных" className="flex flex-wrap gap-2">
            <Button type="button" role="tab" aria-selected={mode === "file"} variant={mode === "file" ? "default" : "outline"} size="sm" onClick={() => setMode("file")} data-testid="import-mode-file"><FileUp aria-hidden="true" /> Файл</Button>
            <Button type="button" role="tab" aria-selected={mode === "gsheet"} variant={mode === "gsheet" ? "default" : "outline"} size="sm" onClick={() => setMode("gsheet")} data-testid="import-mode-gsheet"><SheetIcon aria-hidden="true" /> Google Sheets</Button>
            <Button type="button" role="tab" aria-selected={mode === "paste"} variant={mode === "paste" ? "default" : "outline"} size="sm" onClick={() => setMode("paste")} data-testid="import-mode-paste"><ClipboardPaste aria-hidden="true" /> Вставить таблицу</Button>
          </div>
          {mode === "gsheet" ? (
            <GoogleSheetPicker
              entity={entity}
              onLoaded={(t, meta) => {
                setError(undefined);
                if (entity === "PARTICIPANTS" && !trainingId) return setError("Выберите мероприятие, в которое импортируются участники.");
                setSheet(meta);
                setSourceName(`${meta.title} / ${meta.tab}`);
                accept(t);
              }}
            />
          ) : mode === "file" ? (
            <div className="grid gap-2">
              <Label htmlFor="imp-file">Файл Excel или CSV (до 5 МБ, до 5000 строк)</Label>
              <input id="imp-file" ref={fileRef} type="file" accept=".xlsx,.csv,.tsv,.txt" data-testid="import-file" className="block w-full rounded-md border border-input bg-transparent p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium" />
              <p className="text-xs text-muted-foreground">Формулы не вычисляются: берутся сохранённые значения. Для Google-таблицы выберите источник «Google Sheets».</p>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="imp-paste">Таблица из буфера обмена (первая строка — заголовки)</Label>
              <Textarea id="imp-paste" rows={8} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"ФИО\tТабельный номер\nИванов Иван\t001"} data-testid="import-paste" className="font-mono text-xs" />
            </div>
          )}
          {mode !== "gsheet" && <div className="flex justify-end">
            <Button type="button" onClick={onContinueUpload} disabled={busy} data-testid="import-next-upload">
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} Далее <ArrowRight aria-hidden="true" />
            </Button>
          </div>}
        </section>
      )}

      {step === "preview" && table && (
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-labelledby="wiz-preview">
          <h2 id="wiz-preview" className="font-medium">Предпросмотр</h2>
          <p className="text-sm text-muted-foreground" data-testid="import-preview-stats">
            Источник: {table.fileName}. Колонок: {table.headers.length}, строк с данными: {table.rows.length}. {table.truncatedColumns && "Колонки сверх 60 отброшены. "}{table.source === "GSHEET" && sheet ? `Строка заголовков: ${sheet.headerRow}. ` : ""}Показаны первые 10 строк.
          </p>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-12">№</TableHead>
                  {table.headers.map((h, i) => (<TableHead key={i}>{h}</TableHead>))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {table.rows.slice(0, 10).map((r) => (
                  <TableRow key={r.rowNo}>
                    <TableCell className="text-muted-foreground tabular-nums">{r.rowNo}</TableCell>
                    {r.cells.map((c, i) => (<TableCell key={i} className="max-w-60 truncate">{c}</TableCell>))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Nav onBack={() => setStep("upload")} onNext={() => setStep("mapping")} testId="import-next-preview" />
        </section>
      )}

      {step === "mapping" && table && (
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-labelledby="wiz-map">
          <h2 id="wiz-map" className="font-medium">Соответствие колонок</h2>
          <p className="text-sm text-muted-foreground">Колонки подобраны автоматически по названиям. Проверьте и при необходимости исправьте.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {def.fields.map((f) => {
              const sample = mapping[f.key] != null ? table.rows.find((r) => r.cells[mapping[f.key] as number])?.cells[mapping[f.key] as number] : undefined;
              return (
                <div key={f.key} className="grid gap-1.5">
                  <Label htmlFor={`map-${f.key}`}>
                    {f.label}
                    {f.required && <span className="text-destructive"> *</span>}
                    {f.anyOf && <span className="text-xs font-normal text-muted-foreground"> (ФИО или табельный №)</span>}
                  </Label>
                  <Select id={`map-${f.key}`} value={mapping[f.key] == null ? "" : String(mapping[f.key])} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? null : Number(e.target.value) }))} data-testid={`map-${f.key}`}>
                    <option value="">— не загружать —</option>
                    {table.headers.map((h, i) => (<option key={i} value={i}>{h}</option>))}
                  </Select>
                  <p className="min-h-4 truncate text-xs text-muted-foreground">{sample ? `Например: ${sample}` : f.description}</p>
                </div>
              );
            })}
          </div>
          {missing.length > 0 && <FormAlert error={`Не сопоставлено обязательное: ${missing.join(", ")}.`} />}
          <Nav onBack={() => setStep("preview")} onNext={() => setStep("validation")} nextDisabled={missing.length > 0} testId="import-next-mapping" />
        </section>
      )}

      {step === "validation" && table && built && validation && (
        <section className="space-y-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-labelledby="wiz-val">
          <h2 id="wiz-val" className="font-medium">Проверка перед анализом</h2>
          <div className="flex flex-wrap gap-2" data-testid="import-validation-stats">
            <Badge variant="brand">Строк к отправке: {built.rows.length}</Badge>
            {built.skippedEmpty > 0 && <Badge variant="outline">Пустых пропущено: {built.skippedEmpty}</Badge>}
            <Badge variant={validation.badRows ? "warning" : "success"}>С замечаниями: {validation.badRows}</Badge>
          </div>
          {built.tooMany && <FormAlert error="Не больше 5000 строк за раз. Разбейте файл на части." />}
          {validation.issues.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Такие строки получат статус «Ошибка» и не будут применены. Исправьте файл или продолжайте: остальные строки загрузятся.</p>
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-3 text-sm" data-testid="import-validation-issues">
                {validation.issues.slice(0, 50).map((i, k) => (
                  <li key={k}><span className="text-muted-foreground tabular-nums">Строка {i.rowNo}:</span> {i.message}</li>
                ))}
                {validation.issues.length > 50 && <li className="text-muted-foreground">…и ещё {validation.issues.length - 50}</li>}
              </ul>
            </div>
          )}
          {table.source === "GSHEET" && sheet && entity === "EMPLOYEES" && (
            <div className="grid gap-2 rounded-lg border p-3" data-testid="gsheet-save-source">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={saveSource} onChange={(e) => setSaveSource(e.target.checked)} className="size-4 accent-brand" data-testid="gsheet-save-toggle" />
                Сохранить как источник для синхронизации («Синхронизировать сейчас» без повторной настройки)
              </label>
              {saveSource && (
                <div className="grid gap-1.5">
                  <Label htmlFor="gsheet-source-name">Название источника</Label>
                  <Input id="gsheet-source-name" value={sourceName} onChange={(e) => setSourceName(e.target.value)} maxLength={120} data-testid="gsheet-source-name" />
                </div>
              )}
            </div>
          )}
          <p className="text-sm text-muted-foreground">Дальше система сопоставит строки со справочниками и покажет, что будет создано, обновлено и что требует решения. Пока вы не нажмёте «Применить», данные не меняются.</p>
          <Nav onBack={() => setStep("mapping")} onNext={runDry} nextLabel="Проанализировать (dry run)" nextDisabled={pending || built.tooMany || built.rows.length === 0} pending={pending} testId="import-run-dry" />
        </section>
      )}
    </div>
  );
}

function Nav({ onBack, onNext, nextLabel = "Далее", nextDisabled, pending, testId }: { onBack: () => void; onNext: () => void; nextLabel?: string; nextDisabled?: boolean; pending?: boolean; testId?: string }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
      <Button type="button" variant="outline" onClick={onBack} disabled={pending}><ArrowLeft aria-hidden="true" /> Назад</Button>
      <Button type="button" onClick={onNext} disabled={nextDisabled} data-testid={testId}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} {nextLabel} {!pending && <ArrowRight aria-hidden="true" />}
      </Button>
    </div>
  );
}
