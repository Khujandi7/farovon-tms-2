import { RequestForm } from "@/components/request-portal/request-form";
import { ClosedState } from "@/components/request-portal/closed-state";
import { isValidTokenFormat, parsePublicOptions } from "@/lib/portal/schemas";
import { callPublicRequestOptions } from "@/lib/supabase/service-rpc";

/** Серверная часть публичной страницы: проверяет ссылку и отдаёт форме только названия активных подразделений. */
export async function PortalPage({ token }: { token: string | null }) {
  if (token !== null && !isValidTokenFormat(token)) return <ClosedState />;
  const res = await callPublicRequestOptions(token);
  if (!res.ok) {
    if (res.code === "UNAVAILABLE" || !res.code) return <ClosedState unavailable />;
    return <ClosedState />;
  }
  const options = parsePublicOptions(res.data);
  if (!options) return <ClosedState />;
  return <RequestForm token={token} options={options} />;
}
