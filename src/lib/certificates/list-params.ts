import { CERT_STATUSES } from "./status";

export const CERTS_PAGE_SIZE = 30;
type Raw = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CertListParams = {
  status: (typeof CERT_STATUSES)[number] | null;
  expiring: boolean;
  q: string;
  provider: string | null;
  page: number;
};

export function parseCertListParams(raw: Raw): CertListParams {
  const status = one(raw.status);
  const provider = one(raw.provider) ?? "";
  return {
    status: (CERT_STATUSES as readonly string[]).includes(status ?? "") ? (status as CertListParams["status"]) : null,
    expiring: one(raw.expiring) === "1",
    q: (one(raw.q) ?? "").replace(/[%_,()*\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
    provider: UUID.test(provider) ? provider : null,
    page: Math.min(Math.max(Number(one(raw.page)) || 1, 1), 10000),
  };
}

export function certListQuery(p: CertListParams, page: number): string {
  const sp = new URLSearchParams();
  if (p.status) sp.set("status", p.status);
  if (p.expiring) sp.set("expiring", "1");
  if (p.q) sp.set("q", p.q);
  if (p.provider) sp.set("provider", p.provider);
  if (page > 1) sp.set("page", String(page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}
