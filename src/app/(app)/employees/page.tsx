import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { SectionPage } from "@/components/common/section-page";
import { EmptyState, ErrorState } from "@/components/common/states";
import { NewEmployeeDialog } from "@/components/employees/new-employee-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/workflows/roles";

export const metadata: Metadata = { title: "Сотрудники" };
export const dynamic = "force-dynamic";
const PAGE = 30;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const q = (one(raw.q) ?? "").replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  const dept = /^\d+$/.test(one(raw.dept) ?? "") ? Number(one(raw.dept)) : null;
  const inactive = one(raw.inactive) === "1";
  const page = Math.min(Math.max(Number(one(raw.page)) || 1, 1), 10000);

  return (
    <SectionPage section="employees">
      {async (session) => {
        const supabase = await createClient();
        let req = supabase
          .from("employees")
          .select("id, canonical_id, full_name, position, is_active, department:org_units!employees_department_id_fkey(name), unit:org_units!employees_unit_id_fkey(name)", { count: "exact" })
          .eq("is_active", !inactive)
          .order("full_name")
          .range((page - 1) * PAGE, page * PAGE - 1);
        if (dept) req = req.eq("department_id", dept);
        if (q) req = req.ilike("full_name", `%${q}%`);
        const [{ data, error, count }, { data: orgs }] = await Promise.all([req, supabase.from("org_units").select("id, name, parent_id, level").eq("is_active", true).order("name")]);
        const orgUnits = orgs ?? [];
        const total = count ?? 0;
        const pages = Math.max(1, Math.ceil(total / PAGE));
        const qs = (p: number) => {
          const sp = new URLSearchParams();
          if (q) sp.set("q", q);
          if (dept) sp.set("dept", String(dept));
          if (inactive) sp.set("inactive", "1");
          if (p > 1) sp.set("page", String(p));
          const s = sp.toString();
          return s ? `?${s}` : "";
        };

        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <form method="get" className="flex flex-wrap items-end gap-2" role="search" aria-label="Фильтры сотрудников">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Поиск по ФИО
                  <Input name="q" defaultValue={q} placeholder="Фамилия или имя" className="min-w-52" />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Департамент
                  <Select name="dept" defaultValue={dept ? String(dept) : ""} className="min-w-52">
                    <option value="">Все</option>
                    {orgUnits.filter((u) => u.level === "DEPARTMENT").map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </Select>
                </label>
                <label className="flex h-9 items-center gap-2 text-sm">
                  <input type="checkbox" name="inactive" value="1" defaultChecked={inactive} className="size-4 accent-[var(--brand)]" /> Неактивные
                </label>
                <Button type="submit" variant="outline">Применить</Button>
                {(q || dept || inactive) && <Button asChild variant="ghost"><Link href="/employees">Сбросить</Link></Button>}
              </form>
              {can(session.role, "employee") && <NewEmployeeDialog orgUnits={orgUnits.map((u) => ({ id: u.id, name: u.name, parent_id: u.parent_id, level: u.level }))} />}
            </div>
            {error ? (
              <ErrorState className="bg-card" title="Не удалось загрузить сотрудников" description="Попробуйте обновить страницу." />
            ) : !data?.length ? (
              <EmptyState className="bg-card" icon={Users} title={q || dept ? "Ничего не найдено" : "Справочник пуст"} description="Сотрудники добавляются вручную или будут загружены при импорте справочника." />
            ) : (
              <div className="rounded-xl border bg-card shadow-xs">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Код</TableHead>
                      <TableHead>ФИО</TableHead>
                      <TableHead>Должность</TableHead>
                      <TableHead>Департамент</TableHead>
                      <TableHead>Отдел</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((e) => (
                      <TableRow key={e.id} data-testid="employee-row">
                        <TableCell className="font-mono text-xs text-muted-foreground">{e.canonical_id}</TableCell>
                        <TableCell className="font-medium">
                          <Link href={`/employees/${e.id}`} className="hover:text-brand hover:underline">{e.full_name}</Link>
                          {!e.is_active && <Badge variant="outline" className="ml-2">Неактивен</Badge>}
                        </TableCell>
                        <TableCell>{e.position ?? "—"}</TableCell>
                        <TableCell>{(e.department as { name: string } | null)?.name ?? "—"}</TableCell>
                        <TableCell>{(e.unit as { name: string } | null)?.name ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {total > PAGE && (
              <nav aria-label="Страницы" className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Всего: {total}. Страница {page} из {pages}</span>
                <div className="flex gap-2">
                  <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-50" : undefined}><Link href={`/employees${qs(page - 1)}`}><ChevronLeft /> Назад</Link></Button>
                  <Button asChild variant="outline" size="sm" className={page >= pages ? "pointer-events-none opacity-50" : undefined}><Link href={`/employees${qs(page + 1)}`}>Вперёд <ChevronRight /></Link></Button>
                </div>
              </nav>
            )}
          </div>
        );
      }}
    </SectionPage>
  );
}
