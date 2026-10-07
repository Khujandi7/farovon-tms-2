import { PortalPage } from "@/components/request-portal/portal-page";

export const dynamic = "force-dynamic";

export default async function DepartmentRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PortalPage token={token} />;
}
