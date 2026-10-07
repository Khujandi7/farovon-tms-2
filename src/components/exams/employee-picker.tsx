"use client";

import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchEmployees, type EmployeeHit } from "@/app/(app)/exams/actions";

/** Выбор сотрудника через поиск по ФИО. Значение уходит в форму скрытым полем `name` (по умолчанию employee_id). */
export function EmployeePicker({ id = "employee_id", name = "employee_id", label = "Сотрудник *", error, disabled }: { id?: string; name?: string; label?: string; error?: string; disabled?: boolean }) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<EmployeeHit | null>(null);
  const [res, setRes] = useState<{ q: string; hits: EmployeeHit[]; failed: boolean } | null>(null);
  const seq = useRef(0);
  const term = q.trim();

  useEffect(() => {
    if (picked || term.length < 2) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await searchEmployees(term);
      if (n !== seq.current) return;
      setRes({ q: term, hits: r.ok ? r.data : [], failed: !r.ok });
    }, 250);
    return () => clearTimeout(t);
  }, [term, picked]);

  const fresh = res && res.q === term ? res : null;
  const hits = fresh?.hits ?? [];
  const busy = !fresh;
  const failed = !!fresh?.failed;

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm leading-none font-medium">
        {label}
      </label>
      <input type="hidden" name={name} value={picked?.id ?? ""} />
      {picked ? (
        <div className="flex min-h-10 items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm" data-testid="employee-picked">
          <span className="min-w-0">
            <span className="font-medium">{picked.full_name}</span>
            {picked.position && <span className="text-muted-foreground"> · {picked.position}</span>}
          </span>
          <button type="button" onClick={() => { setPicked(null); setQ(""); }} disabled={disabled} className="grid size-8 shrink-0 place-items-center rounded-md hover:bg-muted" aria-label="Выбрать другого сотрудника">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            id={id}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Начните вводить ФИО"
            autoComplete="off"
            className="h-10 pl-9"
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-help`}
            data-testid="employee-search"
          />
        </div>
      )}
      {!picked && q.trim().length >= 2 && (
        <ul className="max-h-48 overflow-y-auto rounded-md border bg-card text-sm" role="listbox" aria-label="Найденные сотрудники" data-testid="employee-hits">
          {hits.map((h) => (
            <li key={h.id} role="option" aria-selected={false}>
              <button type="button" onClick={() => { setPicked(h); }} className="flex min-h-10 w-full flex-col items-start px-3 py-1.5 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none">
                <span className="font-medium">{h.full_name}</span>
                <span className="text-xs text-muted-foreground">{[h.code, h.position].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
          {!hits.length && <li className="px-3 py-2 text-muted-foreground">{busy ? "Поиск…" : failed ? "Не удалось выполнить поиск." : "Никого не найдено."}</li>}
        </ul>
      )}
      <p id={`${id}-help`} className="sr-only">Введите не менее двух символов</p>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
