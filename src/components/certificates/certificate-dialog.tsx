"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/auth/form-parts";
import { createCertificate, updateCertificate } from "@/app/(app)/certificates/actions";
import { EmployeePicker } from "@/components/exams/employee-picker";
import { FieldBox, FormDialog } from "@/components/exams/form-dialog";
import type { ProviderOption, SkillOption } from "@/components/exams/new-exam-dialog";
import { certificateReasonRequired } from "@/lib/certificates/schemas";
import { CERT_TYPES, CERT_TYPE_LABELS } from "@/lib/certificates/status";

export type CertificateRow = {
  id: string;
  employee_id: string;
  name: string;
  cert_type: string;
  issuing_organization: string | null;
  provider_id: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  certificate_number: string | null;
  skill_id: number | null;
  notes: string | null;
};

/** Создание (без `cert`) или изменение сертификата. При смене дат нужна причина — как в update_certificate. */
export function CertificateDialog({
  cert,
  employee,
  skills,
  providers,
  size = "sm",
}: {
  cert?: CertificateRow;
  employee?: { id: string; name?: string };
  skills: SkillOption[];
  providers: ProviderOption[];
  size?: "sm" | "default";
}) {
  const [issue, setIssue] = useState(cert?.issue_date ?? "");
  const [exp, setExp] = useState(cert?.expiration_date ?? "");
  const needReason = !!cert && certificateReasonRequired({ issue_date: cert.issue_date, expiration_date: cert.expiration_date }, { issue_date: issue || null, expiration_date: exp || null });
  return (
    <FormDialog
      wide
      testId={cert ? "edit-certificate-dialog" : "new-certificate-dialog"}
      title={cert ? "Изменить сертификат" : "Новый сертификат"}
      description={cert ? "Смена дат выдачи и окончания требует причины — она попадёт в журнал." : "Сертификат привязывается к сотруднику; статус рассчитывается по сроку действия."}
      submitLabel={cert ? "Сохранить" : "Добавить"}
      trigger={(open) =>
        cert ? (
          <Button size="sm" variant="outline" onClick={open} aria-label={`Изменить сертификат ${cert.name}`} data-testid="edit-certificate">
            <Pencil aria-hidden="true" /> Изменить
          </Button>
        ) : (
          <Button size={size} onClick={open} data-testid="new-certificate">
            <Plus aria-hidden="true" /> Новый сертификат
          </Button>
        )
      }
      onSubmit={(fd) => {
        const body = {
          name: fd.get("name"),
          cert_type: fd.get("cert_type"),
          issuing_organization: fd.get("issuing_organization"),
          provider_id: fd.get("provider_id"),
          issue_date: fd.get("issue_date"),
          expiration_date: fd.get("expiration_date"),
          certificate_number: fd.get("certificate_number"),
          skill_id: fd.get("skill_id"),
          notes: fd.get("notes"),
        };
        return cert ? updateCertificate({ id: cert.id, ...body, reason: fd.get("reason") }) : createCertificate({ employee_id: employee?.id ?? fd.get("employee_id"), ...body });
      }}
    >
      {({ pending, errors }) => (
        <>
          {!cert &&
            (employee ? (
              <p className="rounded-md bg-muted px-3 py-2 text-sm">Сотрудник: <span className="font-medium">{employee.name ?? "текущий сотрудник"}</span></p>
            ) : (
              <EmployeePicker error={errors.employee_id} disabled={pending} />
            ))}
          <Field id="name" label="Название *" defaultValue={cert?.name ?? ""} error={errors.name} disabled={pending} className="h-10" />
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox id="cert_type" label="Тип *" error={errors.cert_type}>
              <Select id="cert_type" name="cert_type" defaultValue={cert?.cert_type ?? "TRAINING"} disabled={pending} className="h-10">
                {CERT_TYPES.map((t) => (
                  <option key={t} value={t}>{CERT_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </FieldBox>
            <Field id="certificate_number" label="Номер" defaultValue={cert?.certificate_number ?? ""} error={errors.certificate_number} disabled={pending} className="h-10" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="issue_date" label="Дата выдачи" type="date" value={issue} onChange={(e) => setIssue(e.target.value)} error={errors.issue_date} disabled={pending} className="h-10" />
            <Field id="expiration_date" label="Действует до" type="date" value={exp} onChange={(e) => setExp(e.target.value)} hint="Пусто — бессрочный" error={errors.expiration_date} disabled={pending} className="h-10" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FieldBox id="provider_id" label="Провайдер">
              <Select id="provider_id" name="provider_id" defaultValue={cert?.provider_id ?? ""} disabled={pending} className="h-10">
                <option value="">— не указан —</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </FieldBox>
            <FieldBox id="skill_id" label="Навык / квалификация">
              <Select id="skill_id" name="skill_id" defaultValue={cert?.skill_id ?? ""} disabled={pending} className="h-10">
                <option value="">— не указан —</option>
                {skills.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </FieldBox>
          </div>
          <Field id="issuing_organization" label="Выдавшая организация" defaultValue={cert?.issuing_organization ?? ""} error={errors.issuing_organization} disabled={pending} className="h-10" />
          <FieldBox id="notes" label="Примечание" error={errors.notes}>
            <Textarea id="notes" name="notes" rows={2} defaultValue={cert?.notes ?? ""} disabled={pending} />
          </FieldBox>
          {cert && (
            <FieldBox id="reason" label={needReason ? "Причина изменения дат *" : "Причина (необязательно)"} error={errors.reason}>
              <Textarea id="reason" name="reason" rows={2} disabled={pending} />
            </FieldBox>
          )}
        </>
      )}
    </FormDialog>
  );
}
