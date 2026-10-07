import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState, ForbiddenState } from "@/components/common/states";
import { NewAgreementForm } from "@/components/funding/new-agreement-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { canAccessSection } from "@/lib/auth/roles";
import { requireSession } from "@/lib/auth/session";
import { safeLike } from "@/lib/funding/params";
import { loadAgreementFormOptions } from "@/lib/funding/queries";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Новое соглашение" };
export const dynamic = "force-dynamic";
const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function NewAgreementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const session = await requireSession();
  if (session.status !== "ok" || !canAccessSection(session.role, "funding") || !can(session.role, "agreement")) return <ForbiddenState className="bg-card" />;
  const supabase = await createClient();
  const employeeId = first(sp.employee);
  const q = safeLike((first(sp.q) ?? "").slice(0, 100));

  if (employeeId && isUuid(employeeId)) {
    const { data: emp } = await supabase.from("employees").select("id, full_name").eq("id", employeeId).maybeSingle();
    if (emp) {
      const options = await loadAgreementFormOptions(supabase, emp.id);
      return (
        <div className="max-w-3xl space-y-5">
          <PageHeader title="Новое соглашение" description={`Сотрудник: ${emp.full_name}`} backHref="/funding" backLabel="К реестру" />
          <NewAgreementForm employeeId={emp.id} options={options} />
        </div>
      );
    }
  }

  const { data: found } = q ? await supabase.from("employees").select("id, full_name, canonical_id, position").ilike("full_name", `%${q}%`).eq("is_active", true).order("full_name").limit(20) : { data: [] };
  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader title="Новое соглашение" description="Шаг 1: выберите сотрудника" backHref="/funding" backLabel="К реестру" />
      <form method="get" className="flex flex-wrap items-end gap-2" role="search" aria-label="Поиск сотрудника">
        <label className="grid flex-1 gap-1 text-xs text-muted-foreground">
          ФИО сотрудника
          <Input name="q" defaultValue={q} placeholder="Начните вводить ФИО" className="h-10 min-w-56" autoFocus />
        </label>
        <Button type="submit" className="min-h-10">Найти</Button>
      </form>
      {q && !found?.length ? (
        <EmptyState className="bg-card" compact title="Сотрудники не найдены" />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-xs empty:hidden" data-testid="employee-results">
          {(found ?? []).map((e) => (
            <li key={e.id}>
              <Link href={`/funding/new?employee=${e.id}`} className="flex min-h-12 flex-col justify-center px-3 py-2 text-sm hover:bg-accent">
                <span className="font-medium">{e.full_name}</span>
                <span className="text-xs text-muted-foreground">{[e.canonical_id, e.position].filter(Boolean).join(" · ")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
