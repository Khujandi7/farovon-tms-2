import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseConfirmParams, SET_PASSWORD_PATH } from "@/lib/auth/confirm";

/**
 * Ссылка из письма: /auth/confirm?token_hash=…&type=invite|recovery.
 * verifyOtp создаёт сессию в cookie, дальше — всегда /auth/set-password.
 */
export async function GET(request: NextRequest) {
  const parsed = parseConfirmParams(request.nextUrl.searchParams);
  // Относительный Location: браузер остаётся на том хосте, где открыта ссылка, и cookie сессии (только что выданная
  // verifyOtp) действует. Абсолютный адрес из request.url за прокси может указывать на внутренний хост.
  const to = (pathname: string) => new NextResponse(null, { status: 307, headers: { Location: pathname } });
  if (!parsed) return to("/auth/error");

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ token_hash: parsed.tokenHash, type: parsed.type });
    if (error) return to("/auth/error");
  } catch {
    return to("/auth/error");
  }
  return to(SET_PASSWORD_PATH);
}
