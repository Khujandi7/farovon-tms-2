import { Award } from "lucide-react";
import { CertificateActions } from "@/components/certificates/certificate-actions";
import { CertificateDialog } from "@/components/certificates/certificate-dialog";
import { CertificateStatus } from "@/components/certificates/certificate-status";
import { EmptyState, ErrorState } from "@/components/common/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AppRole } from "@/lib/auth/roles";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";
import { certTypeLabel } from "@/lib/certificates/status";
import { loadProviderOptions, loadSkillOptions } from "@/lib/exams/options";

/** Вкладка «Сертификаты» досье: статусы, пометки об истечении, создание/изменение/отзыв. */
export async function CertificatesTab({ employeeId, role }: { employeeId: string; role: AppRole }) {
  const supabase = await createClient();
  const canEdit = can(role, "certificate");
  const [{ data, error }, skills, providers] = await Promise.all([
    supabase.from("v_certificates").select("*").eq("employee_id", employeeId).is("archived_at", null).order("expiration_date", { ascending: true, nullsFirst: false }),
    canEdit ? loadSkillOptions(supabase) : Promise.resolve([]),
    canEdit ? loadProviderOptions(supabase) : Promise.resolve([]),
  ]);
  const provName = new Map(providers.map((p) => [p.id, p.name]));
  const rows = (data ?? []).map((r) => ({
    id: r.id ?? "", employee_id: r.employee_id ?? employeeId, name: r.name ?? "", cert_type: r.cert_type ?? "TRAINING", issuing_organization: r.issuing_organization,
    provider_id: r.provider_id, issue_date: r.issue_date, expiration_date: r.expiration_date, certificate_number: r.certificate_number, skill_id: r.skill_id,
    notes: r.notes, status: r.status, days_left: r.days_left, revoked_reason: r.revoked_reason,
  }));

  return (
    <section className="space-y-3" aria-label="Сертификаты сотрудника" data-testid="certificates-tab">
      {canEdit && (
        <div className="flex justify-end">
          <CertificateDialog employee={{ id: employeeId }} skills={skills} providers={providers} />
        </div>
      )}
      {error ? (
        <ErrorState className="bg-card" compact title="Не удалось загрузить сертификаты" />
      ) : !rows.length ? (
        <EmptyState className="bg-card" compact icon={Award} title="Сертификатов нет" />
      ) : (
        <>
          <div className="hidden rounded-xl border bg-card shadow-xs md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Сертификат</TableHead>
                  <TableHead>Тип</TableHead>
                  <TableHead>Выдан</TableHead>
                  <TableHead>Действует до</TableHead>
                  <TableHead>Статус</TableHead>
                  {canEdit && <TableHead><span className="sr-only">Действия</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} data-testid="dossier-certificate-row">
                    <TableCell className="max-w-72 font-medium whitespace-normal">
                      {r.name}
                      <span className="block text-xs font-normal text-muted-foreground">{[r.certificate_number && `№ ${r.certificate_number}`, (r.provider_id && provName.get(r.provider_id)) || r.issuing_organization].filter(Boolean).join(" · ")}</span>
                      {r.status === "REVOKED" && r.revoked_reason && <span className="block text-xs font-normal text-muted-foreground">Причина отзыва: {r.revoked_reason}</span>}
                    </TableCell>
                    <TableCell>{certTypeLabel(r.cert_type)}</TableCell>
                    <TableCell>{formatDate(r.issue_date)}</TableCell>
                    <TableCell>{r.expiration_date ? formatDate(r.expiration_date) : "бессрочно"}</TableCell>
                    <TableCell><CertificateStatus status={r.status} daysLeft={r.days_left} /></TableCell>
                    {canEdit && <TableCell><CertificateActions cert={r} revoked={r.status === "REVOKED"} skills={skills} providers={providers} /></TableCell>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <ul className="grid gap-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="space-y-2 rounded-xl border bg-card p-3 text-sm shadow-xs">
                <p className="font-medium">{r.name}</p>
                <CertificateStatus status={r.status} daysLeft={r.days_left} />
                <p className="text-xs text-muted-foreground">{certTypeLabel(r.cert_type)} · {r.expiration_date ? `до ${formatDate(r.expiration_date)}` : "бессрочно"}</p>
                {canEdit && <CertificateActions cert={r} revoked={r.status === "REVOKED"} skills={skills} providers={providers} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
