"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReasonDialog } from "@/components/workflow/reason-dialog";
import { revokeCertificate } from "@/app/(app)/certificates/actions";
import type { ProviderOption, SkillOption } from "@/components/exams/new-exam-dialog";
import { CertificateDialog, type CertificateRow } from "./certificate-dialog";

/** Кнопки строки реестра: изменить, отозвать / восстановить (с причиной). Показываются только ролям с правом certificate. */
export function CertificateActions({ cert, revoked, skills, providers }: { cert: CertificateRow; revoked: boolean; skills: SkillOption[]; providers: ProviderOption[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!revoked && <CertificateDialog cert={cert} skills={skills} providers={providers} />}
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label={`${revoked ? "Восстановить" : "Отозвать"} сертификат ${cert.name}`} data-testid={revoked ? "restore-certificate" : "revoke-certificate"}>
        {revoked ? <RotateCcw aria-hidden="true" /> : <Ban aria-hidden="true" />} {revoked ? "Восстановить" : "Отозвать"}
      </Button>
      <ReasonDialog
        open={open}
        title={revoked ? "Восстановить сертификат" : "Отозвать сертификат"}
        description={revoked ? "Сертификат снова получит статус по сроку действия." : "Сертификат получит статус «Отозван». Запись и история сохранятся."}
        confirmLabel={revoked ? "Восстановить" : "Отозвать"}
        destructive={!revoked}
        testId="revoke-certificate-dialog"
        onClose={() => setOpen(false)}
        onConfirm={(reason) => revokeCertificate({ id: cert.id, revoked: !revoked, reason })}
        onDone={() => router.refresh()}
      >
        <p className="rounded-md bg-muted px-3 py-2 text-sm">{cert.name}</p>
      </ReasonDialog>
    </div>
  );
}
