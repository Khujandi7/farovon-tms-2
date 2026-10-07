import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { canExport, columnsFor, exportFileName, isExportEntity } from "@/lib/export/columns";
import { toCsv } from "@/lib/export/csv";
import { ExportInputError, fetchExportRows } from "@/lib/export/fetch";
import { parseExportRequest, parseFormat } from "@/lib/export/params";
import { buildXlsx } from "@/lib/export/xlsx";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const json = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
const SHEET_NAMES = { employees: "Сотрудники", trainings: "Мероприятия", exams: "Экзамены", certificates: "Сертификаты", participants: "Участники", agreements: "Соглашения" } as const;

export async function GET(request: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const { entity } = await ctx.params;
  if (!isExportEntity(entity)) return json(404, "Неизвестный тип выгрузки.");

  let session;
  try {
    session = await getSession();
  } catch {
    return json(503, "Сервис временно недоступен. Попробуйте позже.");
  }
  if (session.status === "anonymous") return json(401, "Сессия устарела. Войдите снова.");
  if (session.status !== "ok" || !canExport(session.role, entity)) return json(403, "Недостаточно прав для этой выгрузки.");

  const sp = request.nextUrl.searchParams;
  const raw: Record<string, string> = Object.fromEntries(sp.entries());
  const parsed = parseExportRequest(entity, raw);
  if (!parsed) return json(404, "Неизвестный тип выгрузки.");
  const format = parseFormat(sp.get("format"));

  try {
    const { rows, truncated } = await fetchExportRows(parsed, session.role);
    const columns = columnsFor(entity, session.role);
    const name = exportFileName(entity, format);
    const headers: Record<string, string> = {
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Export-Rows": String(rows.length),
      "X-Export-Truncated": truncated ? "1" : "0",
    };
    if (format === "xlsx") {
      const buf = await buildXlsx(SHEET_NAMES[entity], columns, rows);
      return new NextResponse(new Uint8Array(buf), { headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } });
    }
    const csv = toCsv(columns.map((c) => c.header), rows.map((r) => columns.map((c) => r[c.key])));
    return new NextResponse(csv, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
  } catch (e) {
    if (e instanceof ExportInputError) return json(400, e.message);
    console.error("[export]", entity, e instanceof Error ? e.message : e);
    return json(500, "Не удалось подготовить файл. Попробуйте ещё раз.");
  }
}
