import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ErrorState, ForbiddenState } from "@/components/common/states";
import { RequestLinksManager, type LinkRow } from "@/components/request-portal/request-links-manager";
import { requireSession } from "@/lib/auth/session";
import { resolveOrigin } from "@/lib/portal/link-url";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Ссылки для заявок" };
export const dynamic = "force-dynamic";

export default async function RequestLinksPage() {
  const session = await requireSession();
  const allowed = session.status === "ok" && can(session.role, "requestLinks");
  let links: LinkRow[] = [];
  let departments: { id: number; name: string }[] = [];
  let isOpen = false;
  let failed = false;
  if (allowed) {
    const supabase = await createClient();
    const [l, d, s] = await Promise.all([
      supabase.from("request_links").select("id, token, scope, org_unit_id, label, is_active, expires_at, uses_count, last_used_at, replaced_by, created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("org_units").select("id, name").eq("level", "DEPARTMENT").eq("is_active", true).order("name"),
      supabase.from("app_settings").select("value").eq("key", "public_request_open").maybeSingle(),
    ]);
    if (l.error || d.error) failed = true;
    departments = d.data ?? [];
    const names = new Map<number, string>();
    // Названия могут относиться к деактивированному подразделению: читаем их отдельно
    const ids = [...new Set((l.data ?? []).map((x) => x.org_unit_id).filter((x): x is number => x !== null))];
    if (ids.length) {
      const n = await supabase.from("org_units").select("id, name, is_active").in("id", ids);
      for (const u of n.data ?? []) names.set(u.id, u.is_active ? u.name : `${u.name} (неактивно)`);
    }
    links = (l.data ?? []).map((x) => ({ ...x, unit_name: x.org_unit_id !== null ? (names.get(x.org_unit_id) ?? "—") : null }));
    isOpen = s.data?.value === "true";
  }
  const h = await headers();
  const origin = resolveOrigin({ envUrl: process.env.NEXT_PUBLIC_SITE_URL, host: h.get("x-forwarded-host") ?? h.get("host"), proto: h.get("x-forwarded-proto") });
  return (
    <div className="space-y-6">
      <PageHeader title="Ссылки для заявок" description="Публичные ссылки, по которым руководители подают заявки на обучение без входа в систему." />
      {!allowed ? (
        <ForbiddenState className="bg-card" title="Нет доступа" description="Ссылками для заявок управляет только администратор." />
      ) : failed ? (
        <ErrorState className="bg-card" title="Не удалось загрузить ссылки" />
      ) : (
        <RequestLinksManager links={links} departments={departments} origin={origin} generalOpen={isOpen} />
      )}
      <Link href="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" /> Настройки
      </Link>
    </div>
  );
}
