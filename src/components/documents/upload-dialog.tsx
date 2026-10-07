"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { confirmDocument, registerDocument } from "@/app/(app)/documents/actions";
import { createClient } from "@/lib/supabase/client";
import { ACCEPT_ATTR, ALLOWED_TYPES_HINT, BUCKET, DOC_TYPE_LABELS, validateFile, type DocScope, type DocType } from "@/lib/documents/rules";

const stripExt = (n: string) => n.replace(/\.[A-Za-z0-9]{1,5}$/, "");

/**
 * Загрузка документа в три шага: register_document (сервер) -> файл в Storage браузером под сессией пользователя -> confirm_document.
 * Если загрузка не удалась, запись остаётся «Ожидает загрузки» и её можно перенести в архив.
 */
export function UploadDialog({ open, onClose, scope, types, defaultType }: { open: boolean; onClose: () => void; scope: DocScope; types: DocType[]; defaultType?: DocType }) {
  const router = useRouter();
  const { notify } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const [step, setStep] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFile(null);
    setTitle("");
    setError(undefined);
    setFieldErrors({});
    setStep(null);
  }
  function close() {
    if (pending) return;
    reset();
    onClose();
  }

  function onPick(f: File | null) {
    setFile(f);
    setError(undefined);
    setFieldErrors({});
    if (!f) return;
    const check = validateFile(f);
    if (!check.ok) setFieldErrors({ file: check.error });
    else if (!title.trim()) setTitle(stripExt(f.name).slice(0, 300));
  }

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFieldErrors({});
    if (!file) {
      setFieldErrors({ file: "Выберите файл." });
      return;
    }
    const check = validateFile(file);
    if (!check.ok) {
      setFieldErrors({ file: check.error });
      return;
    }
    startTransition(async () => {
      setStep("Регистрация документа…");
      const reg = await registerDocument({
        doc_type: fd.get("doc_type"),
        title: fd.get("title"),
        file_name: file.name,
        mime_type: check.mime,
        size_bytes: file.size,
        expires_on: fd.get("expires_on"),
        note: fd.get("note"),
        scope,
      });
      if (!reg.ok) {
        setStep(null);
        setError(reg.error);
        setFieldErrors(reg.fieldErrors ?? {});
        return;
      }
      setStep("Загрузка файла…");
      const supabase = createClient();
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(reg.data.path, file, { contentType: check.mime, upsert: false });
      if (upErr) {
        setStep(null);
        setError("Не удалось загрузить файл. Запись осталась со статусом «Ожидает загрузки»: перенесите её в архив и повторите загрузку.");
        router.refresh();
        return;
      }
      setStep("Проверка…");
      const done = await confirmDocument({ id: reg.data.id, scope });
      setStep(null);
      if (!done.ok) {
        setError(done.error);
        router.refresh();
        return;
      }
      notify(true, done.message ?? "Документ загружен.");
      reset();
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent data-testid="upload-dialog" className="max-sm:h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)]">
        <DialogHeader>
          <DialogTitle>Загрузить документ</DialogTitle>
          <DialogDescription>{ALLOWED_TYPES_HINT}. Файл хранится в закрытом хранилище; доступ только по временной ссылке.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(e.currentTarget);
          }}
        >
          <FormAlert error={error} />
          <div className="grid gap-2">
            <Label htmlFor="doc-file">Файл</Label>
            <Input id="doc-file" ref={fileRef} type="file" accept={ACCEPT_ATTR} disabled={pending} onChange={(e) => onPick(e.target.files?.[0] ?? null)} aria-invalid={fieldErrors.file ? true : undefined} aria-describedby={fieldErrors.file ? "doc-file-error" : undefined} className="h-11 py-2" data-testid="upload-file" />
            {fieldErrors.file && <p id="doc-file-error" className="text-xs text-destructive">{fieldErrors.file}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-type">Тип документа</Label>
            <Select id="doc-type" name="doc_type" defaultValue={defaultType ?? types[0]} disabled={pending} className="h-10">
              {types.map((t) => (
                <option key={t} value={t}>{DOC_TYPE_LABELS[t]}</option>
              ))}
            </Select>
            {fieldErrors.doc_type && <p className="text-xs text-destructive">{fieldErrors.doc_type}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-title">Название</Label>
            <Input id="doc-title" name="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={pending} className="h-10" aria-invalid={fieldErrors.title ? true : undefined} />
            {fieldErrors.title && <p className="text-xs text-destructive">{fieldErrors.title}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-expires">Срок действия (необязательно)</Label>
            <Input id="doc-expires" name="expires_on" type="date" disabled={pending} className="h-10" />
            {fieldErrors.expires_on && <p className="text-xs text-destructive">{fieldErrors.expires_on}</p>}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="doc-note">Заметка (необязательно)</Label>
            <Textarea id="doc-note" name="note" rows={2} disabled={pending} />
          </div>
          {fieldErrors.scope && <p className="text-xs text-destructive">{fieldErrors.scope}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-10" onClick={close} disabled={pending}>Отмена</Button>
            <Button type="submit" className="min-h-10" disabled={pending} data-testid="upload-submit">
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
              {step ?? "Загрузить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
