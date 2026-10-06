"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Field, FormAlert } from "@/components/auth/form-parts";
import { useToast } from "@/components/workflow/toast";
import { createEmployee } from "@/app/(app)/employees/actions";

export type OrgOption = { id: number; name: string; parent_id: number | null; level: "DEPARTMENT" | "UNIT" };

export function NewEmployeeDialog({ orgUnits }: { orgUnits: OrgOption[] }) {
  const router = useRouter();
  const { notify } = useToast();
  const [open, setOpen] = useState(false);
  const [dept, setDept] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | undefined>();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | undefined>>({});
  const departments = orgUnits.filter((u) => u.level === "DEPARTMENT");
  const units = orgUnits.filter((u) => u.level === "UNIT" && String(u.parent_id) === dept);

  function submit(form: HTMLFormElement) {
    const fd = new FormData(form);
    setError(undefined);
    setFieldErrors({});
    start(async () => {
      const r = await createEmployee({ full_name: fd.get("full_name"), position: fd.get("position"), department_id: dept || null, unit_id: fd.get("unit_id") || null });
      if (r.ok) {
        notify(true, r.message ?? "Готово.");
        setOpen(false);
        router.push(`/employees/${r.data.id}`);
      } else {
        setError(r.error);
        setFieldErrors(r.fieldErrors ?? {});
      }
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} data-testid="new-employee">
        <UserPlus aria-hidden="true" /> Добавить сотрудника
      </Button>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent data-testid="employee-dialog">
          <DialogHeader>
            <DialogTitle>Новый сотрудник</DialogTitle>
            <DialogDescription>Сотрудник добавляется в справочник вручную. Из списков участников он не создаётся автоматически.</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }} noValidate>
            <FormAlert error={error} />
            <Field id="full_name" label="ФИО *" error={fieldErrors.full_name} disabled={pending} autoComplete="off" />
            <Field id="position" label="Должность" disabled={pending} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="department_id">Департамент</Label>
                <Select id="department_id" value={dept} onChange={(e) => setDept(e.target.value)} disabled={pending}>
                  <option value="">— не выбран —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="unit_id">Отдел</Label>
                <Select id="unit_id" name="unit_id" defaultValue="" key={dept} disabled={pending || !dept}>
                  <option value="">— не выбран —</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Отмена</Button>
              <Button type="submit" disabled={pending}>{pending && <Loader2 className="animate-spin" aria-hidden="true" />} Добавить</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
