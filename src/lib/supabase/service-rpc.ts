import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

/**
 * Единственное место, где публичный портал заявок использует service_role. Доступны ровно две функции БД,
 * выданные service_role-у миграцией (public_request_options, submit_public_request); таблицы отсюда не читаются и не пишутся.
 * Ничего отсюда не импортируется в клиентский код (server-only), результат — только данные функций.
 */
export type ServiceRpcResult = { ok: true; data: Json } | { ok: false; code: string; message: string };

type PgErr = { code?: string | null; message?: string | null } | null;
const toFail = (e: NonNullable<PgErr>): ServiceRpcResult => ({ ok: false, code: e.code ?? "", message: e.message ?? "" });

export async function callPublicRequestOptions(token: string | null): Promise<ServiceRpcResult> {
  try {
    const { data, error } = await createAdminClient().rpc("public_request_options", { p_token: token ?? "" });
    if (error) return toFail(error);
    return { ok: true, data: data as Json };
  } catch (e) {
    console.error("[portal] public_request_options", e instanceof Error ? e.message : e);
    return { ok: false, code: "UNAVAILABLE", message: "" };
  }
}

export async function callSubmitPublicRequest(token: string | null, payload: Json, clientHash: string): Promise<ServiceRpcResult> {
  try {
    const { data, error } = await createAdminClient().rpc("submit_public_request", { p_token: token ?? "", p: payload, p_client: clientHash });
    if (error) return toFail(error);
    return { ok: true, data: data as Json };
  } catch (e) {
    console.error("[portal] submit_public_request", e instanceof Error ? e.message : e);
    return { ok: false, code: "UNAVAILABLE", message: "" };
  }
}
