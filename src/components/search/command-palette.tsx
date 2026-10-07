"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Loader2, Search } from "lucide-react";
import { globalSearch } from "@/components/search/actions";
import { Button } from "@/components/ui/button";
import { flattenGroups, groupSearchRows, type SearchRow } from "@/lib/portal/search";
import { cn } from "@/lib/utils";

/** Командная палитра Ctrl+K / ⌘K: кнопка в шапке + оверлей с поиском. Без сторонних библиотек. */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<SearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [active, setActive] = useState(0);
  const seq = useRef(0);
  const listId = useId();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onOpenChange = useCallback((o: boolean) => {
    setOpen(o);
    if (!o) {
      seq.current++;
      setQ("");
      setRows([]);
      setError(undefined);
      setLoading(false);
      setActive(0);
    }
  }, []);

  // Дебаунс 250 мс; устаревшие ответы отбрасываются по номеру запроса
  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await globalSearch(term);
      if (id !== seq.current) return;
      setLoading(false);
      if (res.ok) {
        setError(undefined);
        setRows(res.data);
        setActive(0);
      } else {
        setError(res.error);
        setRows([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  const short = q.trim().length < 2;
  const groups = useMemo(() => (short ? [] : groupSearchRows(rows)), [rows, short]);
  const flat = useMemo(() => flattenGroups(groups), [groups]);

  function go(r: SearchRow) {
    onOpenChange(false);
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (flat.length === 0) return;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % flat.length : (i - 1 + flat.length) % flat.length));
    } else if (e.key === "Enter") {
      const r = flat[active];
      if (r) {
        e.preventDefault();
        go(r);
      }
    }
  }

  useEffect(() => {
    document.getElementById(`${listId}-opt-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [active, listId, flat]);

  let index = -1;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <Button variant="ghost" size="sm" className="h-10 gap-2 px-2.5 text-muted-foreground sm:h-9" onClick={() => setOpen(true)} aria-label="Поиск (Ctrl+K)" data-testid="search-trigger">
        <Search aria-hidden="true" />
        <span className="hidden sm:inline">Поиск</span>
        <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] font-medium md:inline">Ctrl K</kbd>
      </Button>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          className="fixed top-[8dvh] left-1/2 z-50 flex max-h-[80dvh] w-[calc(100vw-1.5rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-xl border bg-background shadow-xl"
          data-testid="search-dialog"
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Глобальный поиск</DialogPrimitive.Title>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Сотрудник, обучение, заявка, экзамен, договор…"
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
              role="combobox"
              aria-expanded={flat.length > 0}
              aria-controls={listId}
              aria-activedescendant={flat.length > 0 ? `${listId}-opt-${active}` : undefined}
              aria-label="Поисковый запрос"
              autoComplete="off"
              data-testid="search-input"
            />
            {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Поиск" />}
            <kbd className="hidden rounded border bg-muted px-1.5 text-[10px] text-muted-foreground sm:inline">Esc</kbd>
          </div>
          <div id={listId} role="listbox" aria-label="Результаты поиска" className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {short ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground">Введите не меньше 2 символов</p>
            ) : error ? (
              <p className="px-3 py-8 text-center text-sm text-destructive" role="alert">{error}</p>
            ) : !loading && groups.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-muted-foreground" data-testid="search-empty">Ничего не найдено</p>
            ) : (
              groups.map((g) => (
                <div key={g.kind} role="group" aria-label={g.label} className="py-1">
                  <p className="px-2.5 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</p>
                  {g.rows.map((r) => {
                    index++;
                    const i = index;
                    return (
                      <div
                        key={`${r.kind}-${r.id}`}
                        id={`${listId}-opt-${i}`}
                        role="option"
                        aria-selected={i === active}
                        data-testid="search-result"
                        onMouseMove={() => setActive(i)}
                        onClick={() => go(r)}
                        className={cn("flex min-h-11 cursor-pointer flex-col justify-center rounded-md px-2.5 py-1.5", i === active && "bg-accent")}
                      >
                        <span className="truncate text-sm font-medium">{r.title}</span>
                        {r.subtitle && <span className="truncate text-xs text-muted-foreground">{r.subtitle}</span>}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
