"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { upsertSkill } from "@/app/(app)/exams/actions";
import { SKILL_KINDS, SKILL_KIND_LABELS } from "@/lib/exams/format";

export type SkillDictRow = { id: number; name: string; kind: string; is_active: boolean };

/** Справочник навыков и квалификаций: добавить, переименовать, отключить. Только ADMIN / ACADEMY_MANAGER / HR. */
export function SkillsDictionaryDialog({ skills }: { skills: SkillDictRow[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [kind, setKind] = useState("SKILL");

  function run(payload: Record<string, unknown>, after?: () => void) {
    setError(undefined);
    start(async () => {
      const r = await upsertSkill(payload);
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        after?.();
        router.refresh();
      } else setError(r.fieldErrors?.name ?? r.error);
    });
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} data-testid="skills-dictionary">
        <BookOpen aria-hidden="true" /> Справочник навыков
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-xl" data-testid="skills-dictionary-dialog">
          <DialogHeader>
            <DialogTitle>Справочник навыков</DialogTitle>
            <DialogDescription>Навыки, квалификации и сертификации. Отключённые не предлагаются в новых записях, история сохраняется.</DialogDescription>
          </DialogHeader>
          <FormAlert error={error} />
          <form
            className="grid gap-2 sm:grid-cols-[1fr_10rem_auto]"
            onSubmit={(e) => {
              e.preventDefault();
              run({ name, kind }, () => setName(""));
            }}
          >
            <Input aria-label="Название нового навыка" placeholder="Название (например, ACCA)" value={name} onChange={(e) => setName(e.target.value)} disabled={pending} className="h-10" data-testid="skill-name" />
            <Select aria-label="Тип" value={kind} onChange={(e) => setKind(e.target.value)} disabled={pending} className="h-10">
              {SKILL_KINDS.map((k) => (
                <option key={k} value={k}>{SKILL_KIND_LABELS[k]}</option>
              ))}
            </Select>
            <Button type="submit" disabled={pending || name.trim().length < 2} className="h-10">
              {pending && <Loader2 className="animate-spin" aria-hidden="true" />} Добавить
            </Button>
          </form>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-md border text-sm">
            {skills.map((s) => (
              <li key={s.id} className="flex min-h-11 items-center justify-between gap-2 px-3 py-1.5">
                <span className="min-w-0">
                  <span className={s.is_active ? "font-medium" : "text-muted-foreground line-through"}>{s.name}</span>{" "}
                  <Badge variant="outline">{SKILL_KIND_LABELS[s.kind as keyof typeof SKILL_KIND_LABELS] ?? s.kind}</Badge>
                </span>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run({ id: s.id, name: s.name, kind: s.kind, is_active: !s.is_active })} aria-label={`${s.is_active ? "Отключить" : "Включить"} ${s.name}`}>
                  {s.is_active ? "Отключить" : "Включить"}
                </Button>
              </li>
            ))}
            {!skills.length && <li className="px-3 py-3 text-muted-foreground">Справочник пуст.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
