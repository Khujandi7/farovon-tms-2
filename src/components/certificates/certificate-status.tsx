import { Badge } from "@/components/ui/badge";
import { certStatusLabel, certStatusTone, expiryNote } from "@/lib/certificates/status";
import { cn } from "@/lib/utils";

/** Статус сертификата + пометка «Истекает через N дн.» / «Просрочен на N дн.». Статус и days_left приходят из v_certificates. */
export function CertificateStatus({ status, daysLeft, className }: { status: string | null; daysLeft: number | null; className?: string }) {
  const note = expiryNote(status, daysLeft);
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)} data-testid="cert-status">
      <Badge variant={certStatusTone(status)}>{certStatusLabel(status)}</Badge>
      {note && (
        <Badge variant="warning" className={note.tone === "danger" ? "bg-destructive/15 text-destructive" : undefined} data-testid="cert-expiry-note">
          {note.text}
        </Badge>
      )}
    </span>
  );
}
