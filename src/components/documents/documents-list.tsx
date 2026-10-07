"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Download, Eye, FileText, Lock, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/states";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { useToast } from "@/components/workflow/toast";
import { archiveDocument, createDocumentSignedUrl } from "@/app/(app)/documents/actions";
import { formatDate } from "@/lib/format";
import { DOC_STATUS_LABELS, docTypeLabel, documentUiStatus, formatBytes, isExpired, type DocScope, type DocType, type UiDocStatus } from "@/lib/documents/rules";
import { UploadDialog } from "./upload-dialog";

export type DocumentRow = {
  id: string;
  doc_type: string;
  title: string;
  file_name: string;
  size_bytes: number;
  status: string;
  uploaded_at: string;
  expires_on: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  note: string | null;
  canWrite: boolean;
};

const STATUS_VARIANT: Record<UiDocStatus, "success" | "warning" | "outline"> = { ACTIVE: "success", PENDING: "warning", ARCHIVED: "outline" };

export function DocumentsList({ docs, scope, uploadTypes, title, restricted }: { docs: DocumentRow[]; scope: DocScope; uploadTypes: DocType[]; title: string; restricted: boolean }) {
  const router = useRouter();
  const { notify } = useToast();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [target, setTarget] = useState<DocumentRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const visible = docs.filter((d) => showArchived || !d.archived_at);
  const archivedCount = docs.filter((d) => d.archived_at).length;

  async function open(d: DocumentRow, download: boolean) {
    setBusy(d.id + (download ? "d" : "v"));
    // Окно открываем сразу (по клику), иначе блокировщик всплывающих окон закроет его после await.
    const win = download ? null : window.open("", "_blank");
    const res = await createDocumentSignedUrl({ id: d.id, download });
    setBusy(null);
    if (!res.ok) {
      win?.close();
      notify(false, res.error);
      return;
    }
    if (download) {
      const a = document.createElement("a");
      a.href = res.data.url;
      a.rel = "noopener";
      a.download = d.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (win) {
      win.opener = null;
      win.location.href = res.data.url;
    } else {
      window.location.assign(res.data.url);
    }
  }

  if (restricted) {
    return <EmptyState className="bg-card" compact icon={Lock} title="Документы недоступны для вашей роли" description="Роль не предусматривает просмотр документов этого типа." />;
  }

  return (
    <section className="space-y-3" aria-label={title} data-testid="documents-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="flex flex-wrap items-center gap-3">
          {archivedCount > 0 && (
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-4 accent-[var(--brand)]" /> Архив ({archivedCount})
            </label>
          )}
          {uploadTypes.length > 0 && (
            <Button size="sm" className="min-h-10" onClick={() => setUploadOpen(true)} data-testid="upload-document">
              <Upload aria-hidden="true" /> Загрузить
            </Button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState className="bg-card" compact icon={FileText} title="Документов пока нет" description={uploadTypes.length ? "Загрузите первый документ кнопкой «Загрузить»." : undefined} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs">
          {visible.map((d) => {
            const st = documentUiStatus(d);
            const expired = st === "ACTIVE" && isExpired(d.expires_on);
            return (
              <li key={d.id} className={"flex flex-wrap items-start justify-between gap-3 px-3 py-3 text-sm" + (st === "ARCHIVED" ? " opacity-70" : "")} data-testid="document-row">
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 font-medium break-words">
                    {d.title}
                    <Badge variant="secondary">{docTypeLabel(d.doc_type)}</Badge>
                    <Badge variant={STATUS_VARIANT[st]}>{DOC_STATUS_LABELS[st]}</Badge>
                    {expired && <Badge variant="warning">Срок истёк</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.file_name} · {formatBytes(d.size_bytes)} · загружен {formatDate(d.uploaded_at)}
                    {d.expires_on ? ` · действует до ${formatDate(d.expires_on)}` : ""}
                  </p>
                  {d.note && <p className="text-xs text-muted-foreground">{d.note}</p>}
                  {d.archive_reason && <p className="text-xs text-muted-foreground">Причина архивации: {d.archive_reason}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {d.status === "UPLOADED" && (
                    <>
                      <Button size="icon" variant="ghost" className="size-10" aria-label={`Открыть: ${d.title}`} disabled={busy === d.id + "v"} onClick={() => open(d, false)} data-testid="document-view">
                        <Eye aria-hidden="true" />
                      </Button>
                      <Button size="icon" variant="ghost" className="size-10" aria-label={`Скачать: ${d.title}`} disabled={busy === d.id + "d"} onClick={() => open(d, true)} data-testid="document-download">
                        <Download aria-hidden="true" />
                      </Button>
                    </>
                  )}
                  {d.canWrite && (
                    <Button size="icon" variant="ghost" className="size-10" aria-label={d.archived_at ? `Вернуть из архива: ${d.title}` : `В архив: ${d.title}`} onClick={() => setTarget(d)} data-testid="document-archive">
                      {d.archived_at ? <ArchiveRestore aria-hidden="true" /> : <Archive aria-hidden="true" />}
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {uploadTypes.length > 0 && <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} scope={scope} types={uploadTypes} />}

      <ReasonDialog
        open={!!target}
        title={target?.archived_at ? "Вернуть документ из архива" : "Перенести документ в архив"}
        description={target?.archived_at ? "Документ снова появится в списке." : "Файл не удаляется: он остаётся в хранилище и в журнале изменений."}
        confirmLabel={target?.archived_at ? "Вернуть" : "В архив"}
        testId="archive-document-dialog"
        onClose={() => setTarget(null)}
        onConfirm={(reason) => archiveDocument({ id: target!.id, archived: !target!.archived_at, reason, scope: scope as Record<string, string | undefined> }).then((r) => (r.ok ? { ok: true as const, message: r.message } : { ok: false as const, error: r.error }))}
        onDone={() => router.refresh()}
      />
    </section>
  );
}
