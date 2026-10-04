import { PageHeader } from "@/components/common/page-header";
import { ForbiddenState } from "@/components/common/states";
import { getSectionAccess, type SectionAccess } from "@/lib/auth/session";
import type { SectionId } from "@/lib/auth/roles";
import { navItemById } from "@/lib/navigation";

type Allowed = Extract<SectionAccess, { allowed: true }>["session"];

/**
 * Каркас страницы раздела: заголовок + проверка доступа роли к разделу.
 * Проверка роли здесь — для понятного сообщения; данные всё равно защищает RLS.
 */
export async function SectionPage({
  section,
  actions,
  children,
}: {
  section: SectionId;
  actions?: React.ReactNode;
  children: (session: Allowed) => React.ReactNode | Promise<React.ReactNode>;
}) {
  const item = navItemById(section);
  const access = await getSectionAccess(section);
  return (
    <div className="space-y-6">
      <PageHeader title={item.label} description={item.description} actions={access.allowed ? actions : undefined} />
      {access.allowed ? await children(access.session) : <ForbiddenState className="bg-card" />}
    </div>
  );
}
