import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getPublicEnv } from "@/lib/env";
import { isPublicPath, loginRedirectPath } from "@/lib/auth/routes";

/** Есть ли в запросе cookie сессии Supabase (sb-<ref>-auth-token, в т.ч. разбитые на части). */
export function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
}

/**
 * Обновляет сессию Supabase (продлевает JWT, переписывает cookie) и не пускает неавторизованных
 * на закрытые маршруты. Роль здесь не проверяется: это делают серверные страницы через app_role() и RLS.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  let response = NextResponse.next({ request });

  let userId: string | null = null;
  if (hasAuthCookie(request)) {
    const env = getPublicEnv();
    const supabase = createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // getClaims() проверяет подпись JWT; не заменять на getSession() (непроверенные данные из cookie).
    const { data } = await supabase.auth.getClaims();
    userId = (data?.claims?.sub as string | undefined) ?? null;
  }

  if (!userId && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    const next = loginRedirectPath(pathname + search);
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (userId && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
