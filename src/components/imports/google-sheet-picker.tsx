"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, Sheet as SheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/auth/form-parts";
import { googleSheetsStatus, inspectGoogleSheet, readGoogleSheet } from "@/app/(app)/imports/google-actions";
import { parseSheetUrl } from "@/lib/google/sheets-url";
import type { ImportEntity } from "@/lib/imports/entities";
import type { ParsedTable } from "@/lib/imports/types";

export type GoogleSheetMeta = { url: string; tab: string; headerRow: number; title: string };
type Info = { url: string; title: string; tabs: { title: string; rows: number }[] };

/**
 * Источник «Google Sheets»: ссылка → «Получить данные» (листы читает сервер сервисным аккаунтом) → выбор листа и строки
 * заголовков → предпросмотр. Ключи Google в браузер не попадают; ссылка проверяется и здесь, и на сервере.
 */
export function GoogleSheetPicker({ entity, onLoaded }: { entity: ImportEntity; onLoaded: (table: ParsedTable, meta: GoogleSheetMeta) => void }) {
  const [status, setStatus] = useState<{ configured: boolean; serviceAccountEmail: string | null } | null>(null);
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState<Info | null>(null);
  const [tab, setTab] = useState("");
  const [header, setHeader] = useState("auto");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    googleSheetsStatus().then((r) => alive && setStatus(r.ok ? r.data : { configured: false, serviceAccountEmail: null }));
    return () => {
      alive = false;
    };
  }, []);

  function connect() {
    setError(undefined);
    const local = parseSheetUrl(url);
    if (!local.ok) return setError(local.error);
    startTransition(async () => {
      const r = await inspectGoogleSheet({ url });
      if (!r.ok) return setError(r.error);
      setInfo({ url: r.data.url, title: r.data.title, tabs: r.data.tabs.map((t) => ({ title: t.title, rows: t.rows })) });
      setTab(r.data.gidTab ?? r.data.tabs[0]?.title ?? "");
    });
  }

  function load() {
    if (!info || !tab) return;
    setError(undefined);
    startTransition(async () => {
      const r = await readGoogleSheet({ url: info.url, tab, headerRow: header === "auto" ? null : Number(header), entity });
      if (!r.ok) return setError(r.error);
      onLoaded(r.data.table, { url: info.url, tab, headerRow: r.data.headerRow, title: info.title });
    });
  }

  return (
    <div className="space-y-3" data-testid="gsheet-picker">
      {status && !status.configured && (
        <FormAlert error="Доступ к Google Sheets ещё не настроен на сервере. Администратору нужно задать ключ сервисного аккаунта (docs/DEPLOYMENT.md)." />
      )}
      {status?.serviceAccountEmail && (
        <p className="text-xs text-muted-foreground" data-testid="gsheet-sa">
          Чтобы TMS увидела закрытую корпоративную таблицу, откройте её адресу <span className="font-mono break-all text-foreground">{status.serviceAccountEmail}</span> с правом «Читатель».
        </p>
      )}
      <FormAlert error={error} />
      <div className="grid gap-2">
        <Label htmlFor="gsheet-url">Ссылка на Google-таблицу</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input id="gsheet-url" value={url} onChange={(e) => { setUrl(e.target.value); setInfo(null); }} placeholder="https://docs.google.com/spreadsheets/d/…" inputMode="url" autoComplete="off" data-testid="gsheet-url" />
          <Button type="button" variant="outline" onClick={connect} disabled={pending || !url.trim()} data-testid="gsheet-connect">
            {pending && !info ? <Loader2 className="animate-spin" aria-hidden="true" /> : <SheetIcon aria-hidden="true" />} Получить данные
          </Button>
        </div>
      </div>
      {info && (
        <div className="grid gap-3 rounded-lg border p-3" data-testid="gsheet-info">
          <p className="text-sm">Таблица: <strong>{info.title}</strong></p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="gsheet-tab">Лист</Label>
              <Select id="gsheet-tab" value={tab} onChange={(e) => setTab(e.target.value)} data-testid="gsheet-tab">
                {info.tabs.map((t) => (<option key={t.title} value={t.title}>{t.title}{t.rows ? ` · до ${t.rows} строк` : ""}</option>))}
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="gsheet-header">Строка заголовков</Label>
              <Select id="gsheet-header" value={header} onChange={(e) => setHeader(e.target.value)} data-testid="gsheet-header">
                <option value="auto">Определить автоматически</option>
                {Array.from({ length: 15 }, (_, i) => (<option key={i} value={i + 1}>Строка {i + 1}</option>))}
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={load} disabled={pending || !tab} data-testid="gsheet-load">
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} Показать предпросмотр
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
