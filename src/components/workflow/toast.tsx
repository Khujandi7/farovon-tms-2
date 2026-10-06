"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; ok: boolean; text: string };
type Ctx = { notify: (ok: boolean, text: string) => void };

const ToastContext = createContext<Ctx>({ notify: () => {} });

/** Короткие уведомления об итоге действия. role="status" читается скринридером; ошибки остаются дольше. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const notify = useCallback(
    (ok: boolean, text: string) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-3), { id, ok, text }]);
      setTimeout(() => dismiss(id), ok ? 4500 : 9000);
    },
    [dismiss],
  );
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-3 bottom-3 left-3 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-96" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.ok ? "status" : "alert"}
            data-testid={t.ok ? "toast-ok" : "toast-error"}
            className={cn(
              "pointer-events-auto flex w-full items-start gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm shadow-lg",
              t.ok ? "border-success/40" : "border-destructive/40",
            )}
          >
            {t.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" /> : <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />}
            <span className="min-w-0 flex-1 break-words">{t.text}</span>
            <button type="button" onClick={() => dismiss(t.id)} className="rounded p-0.5 opacity-60 hover:opacity-100" aria-label="Закрыть уведомление">
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
