"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Plus, Power, RefreshCw } from "lucide-react";
import { createRequestLink, regenerateRequestLink, setPublicRequestOpen, setRequestLinkActive } from "@/app/(app)/settings/request-links/actions";
import { EmptyState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { formatDate } from "@/lib/format";
import { LINK_STATUS_LABELS, linkStatus } from "@/lib/portal/link-status";
import { buildRequestUrl } from "@/lib/portal/link-url";

export type LinkRow = {
  id: string;
  token: string;
  scope: string;
  org_unit_id: number | null;
  unit_name: string | null;
  label: string;
  is_active: boolean;
  expires_at: string | null;
  uses_count: number;
  last_used_at: string | null;
  replaced_by: string | null;
  created_at: string;
};

type Dialog =
  | { kind: "create" }
  | { kind: "toggle"; link: LinkRow }
  | { kind: "regenerate"; link: LinkRow }
  | { kind: "general" }
  | null;

function formatDateTime(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Dushanbe" }).format(d);
}

export function RequestLinksManager({ links, departments, origin, generalOpen }: { links: LinkRow[]; departments: { id: number; name: string }[]; origin: string; generalOpen: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [label, setLabel] = useState("");
  const [unit, setUnit] = useState("");
  const [expires, setExpires] = useState("");

  const refresh = () => router.refresh();
  const close = () => setDialog(null);

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      notify(true, "Ссылка скопирована.");
    } catch {
      notify(false, "Не удалось скопировать. Выделите ссылку вручную.");
    }
  }

  const generalUrl = buildRequestUrl(origin, null);

  return (
    <div className="space-y-4" data-testid="request-links">
      <Card>
        <CardHeader>
          <CardTitle>Общая форма</CardTitle>
          <CardDescription>Адрес без токена: инициатор сам выбирает подразделение из списка действующих.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <code className="block break-all rounded bg-muted px-2 py-1 text-xs" data-testid="general-url">{generalUrl}</code>
            <p className="text-sm">
              Приём публичных заявок: <Badge variant={generalOpen ? "success" : "outline"} data-testid="general-state">{generalOpen ? "открыт" : "закрыт"}</Badge>
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="h-10" onClick={() => copy(generalUrl)}>
              <Copy /> Копировать
            </Button>
            <Button variant={generalOpen ? "outline" : "default"} className="h-10" onClick={() => setDialog({ kind: "general" })} data-testid="toggle-general">
              <Power /> {generalOpen ? "Закрыть приём" : "Открыть приём"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Ссылки</h2>
        <Button className="h-10" onClick={() => { setLabel(""); setUnit(""); setExpires(""); setDialog({ kind: "create" }); }} data-testid="create-link">
          <Plus /> Создать ссылку
        </Button>
      </div>

      {links.length === 0 ? (
        <EmptyState className="bg-card" icon={Link2} title="Ссылок пока нет" description="Создайте ссылку для подразделения или общую." />
      ) : (
        <ul className="space-y-3">
          {links.map((l) => {
            const st = linkStatus(l);
            const url = buildRequestUrl(origin, l.token);
            return (
              <li key={l.id} className="rounded-xl border bg-card p-4" data-testid="link-row">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <p className="font-medium break-words">{l.label}</p>
                    <p className="text-sm text-muted-foreground">{l.scope === "DEPARTMENT" ? `Подразделение: ${l.unit_name ?? "—"}` : "Общая (выбор подразделения в форме)"}</p>
                  </div>
                  <Badge variant={st === "ACTIVE" ? "success" : "outline"}>{LINK_STATUS_LABELS[st]}</Badge>
                </div>
                <code className="mt-2 block break-all rounded bg-muted px-2 py-1 text-xs">{url}</code>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                  <div><dt>Использований</dt><dd className="text-sm text-foreground">{l.uses_count}</dd></div>
                  <div><dt>Последнее</dt><dd className="text-sm text-foreground">{formatDateTime(l.last_used_at)}</dd></div>
                  <div><dt>Создана</dt><dd className="text-sm text-foreground">{formatDate(l.created_at)}</dd></div>
                  <div><dt>Действует до</dt><dd className="text-sm text-foreground">{l.expires_at ? formatDate(l.expires_at) : "без срока"}</dd></div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="outline" className="h-10" onClick={() => copy(url)} disabled={st === "REPLACED"}>
                    <Copy /> Копировать
                  </Button>
                  {st !== "REPLACED" && (
                    <Button variant="outline" className="h-10" onClick={() => setDialog({ kind: "toggle", link: l })} data-testid="toggle-link">
                      <Power /> {l.is_active ? "Отключить" : "Включить"}
                    </Button>
                  )}
                  {st !== "REPLACED" && (
                    <Button variant="outline" className="h-10" onClick={() => setDialog({ kind: "regenerate", link: l })} data-testid="regenerate-link">
                      <RefreshCw /> Перегенерировать
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ReasonDialog
        open={dialog?.kind === "create"}
        title="Новая ссылка для заявок"
        confirmLabel="Создать"
        testId="create-link-dialog"
        onClose={close}
        onDone={refresh}
        onConfirm={(reason) => createRequestLink({ label, org_unit_id: unit, expires_at: expires || null, reason })}
      >
        <div className="grid gap-2">
          <Label htmlFor="link-label">Название</Label>
          <Input id="link-label" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} placeholder="Например: Департамент продаж" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="link-unit">Подразделение</Label>
          <Select id="link-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">Общая ссылка (выбор в форме)</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">Подразделение закрепляется за ссылкой и в форме не меняется. Переименование подразделения ссылку не ломает.</p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="link-expires">Действует до (необязательно)</Label>
          <Input id="link-expires" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        </div>
      </ReasonDialog>

      <ReasonDialog
        open={dialog?.kind === "toggle"}
        title={dialog?.kind === "toggle" && dialog.link.is_active ? "Отключить ссылку" : "Включить ссылку"}
        description={dialog?.kind === "toggle" && dialog.link.is_active ? "После отключения страница покажет «Ссылка недействительна», новые заявки по ней приниматься не будут." : undefined}
        confirmLabel={dialog?.kind === "toggle" && dialog.link.is_active ? "Отключить" : "Включить"}
        destructive={dialog?.kind === "toggle" && dialog.link.is_active}
        testId="toggle-link-dialog"
        onClose={close}
        onDone={refresh}
        onConfirm={(reason) => (dialog?.kind === "toggle" ? setRequestLinkActive({ id: dialog.link.id, active: !dialog.link.is_active, reason }) : Promise.resolve({ ok: false as const, error: "Ссылка не выбрана." }))}
      />

      <ReasonDialog
        open={dialog?.kind === "regenerate"}
        title="Перегенерировать ссылку"
        description="Будет выпущена новая ссылка с тем же подразделением. Старая ссылка немедленно перестанет работать: всем, кому вы её отправляли, нужно передать новую."
        confirmLabel="Перегенерировать"
        destructive
        testId="regenerate-link-dialog"
        onClose={close}
        onDone={refresh}
        onConfirm={(reason) => (dialog?.kind === "regenerate" ? regenerateRequestLink({ id: dialog.link.id, reason }) : Promise.resolve({ ok: false as const, error: "Ссылка не выбрана." }))}
      />

      <ReasonDialog
        open={dialog?.kind === "general"}
        title={generalOpen ? "Закрыть приём общей формы" : "Открыть приём общей формы"}
        description={generalOpen ? "Адрес /request покажет «Приём заявок закрыт». Ссылки подразделений продолжат работать." : "Адрес /request станет доступен всем, у кого есть ссылка."}
        confirmLabel={generalOpen ? "Закрыть приём" : "Открыть приём"}
        destructive={generalOpen}
        testId="general-dialog"
        onClose={close}
        onDone={refresh}
        onConfirm={(reason) => setPublicRequestOpen({ open: !generalOpen, reason })}
      />
    </div>
  );
}
