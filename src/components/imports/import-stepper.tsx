import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const IMPORT_STEPS = [
  { id: "upload", label: "Загрузка" },
  { id: "preview", label: "Предпросмотр" },
  { id: "mapping", label: "Колонки" },
  { id: "validation", label: "Проверка" },
  { id: "dq", label: "Качество данных" },
  { id: "dry", label: "Dry run" },
  { id: "commit", label: "Применение" },
] as const;
export type ImportStepId = (typeof IMPORT_STEPS)[number]["id"];

/** Индикатор шагов мастера: UPLOAD → PREVIEW → MAPPING → VALIDATION → DQ → DRY RUN → COMMIT. */
export function ImportStepper({ current }: { current: ImportStepId }) {
  const idx = IMPORT_STEPS.findIndex((s) => s.id === current);
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2 text-xs" aria-label="Шаги импорта" data-testid="import-stepper">
      {IMPORT_STEPS.map((s, i) => (
        <li key={s.id} aria-current={i === idx ? "step" : undefined} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1", i === idx ? "border-brand bg-brand-soft font-medium text-brand" : i < idx ? "text-foreground" : "text-muted-foreground")}>
          {i < idx ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <span className="tabular-nums">{i + 1}</span>}
          {s.label}
        </li>
      ))}
    </ol>
  );
}
