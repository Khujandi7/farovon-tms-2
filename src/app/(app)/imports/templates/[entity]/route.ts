import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { ENTITY_DEFS, canImportEntity, entityFromSlug } from "@/lib/imports/entities";
import { buildTemplateXlsx } from "@/lib/imports/templates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Шаблон .xlsx для сущности импорта. Доступен тем, кто может импортировать эту сущность (повторяет can_import). */
export async function GET(_req: Request, ctx: { params: Promise<{ entity: string }> }) {
  const { entity: slug } = await ctx.params;
  const entity = entityFromSlug(slug);
  if (!entity) return NextResponse.json({ error: "Неизвестная сущность импорта." }, { status: 404 });
  let session;
  try {
    session = await getSession();
  } catch {
    return NextResponse.json({ error: "Сервис временно недоступен." }, { status: 503 });
  }
  if (session.status === "anonymous") return NextResponse.json({ error: "Войдите в систему." }, { status: 401 });
  if (session.status !== "ok" || !canImportEntity(session.role, entity)) return NextResponse.json({ error: "Недостаточно прав." }, { status: 403 });

  const bytes = await buildTemplateXlsx(entity);
  const name = `import_${ENTITY_DEFS[entity].slug}_template.xlsx`;
  return new NextResponse(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
