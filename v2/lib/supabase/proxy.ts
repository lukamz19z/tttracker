import { getSecurityStatus } from "@/lib/security/status";
import { securityError } from "@/lib/security/errors";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Verifies/refreshes the auth token and writes refreshed cookies.
  const { data, error } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  const protectedRoute =
    /^\/(workspace|project|platform-admin|setup)(?:\/|$)/.test(path) ||
    /^\/api\/(projects|people|platform|settings)(?:\/|$)/.test(path);
  if (!error && data?.claims?.sub && protectedRoute) {
    try {
      const security = await getSecurityStatus(supabase);
      if (!security.complete) {
        const denied = path.startsWith("/api/")
          ? NextResponse.json(
              {
                code: "SECURITY_CHECK_REQUIRED",
                error: "Complete the security check before continuing.",
              },
              { status: 403 },
            )
          : NextResponse.redirect(
              new URL(
                `/security-check?next=${encodeURIComponent(path + request.nextUrl.search)}`,
                request.url,
              ),
            );
        for (const cookie of response.cookies.getAll())
          denied.cookies.set(cookie);
        return denied;
      }
    } catch (securityFailure) {
      const result = securityError(securityFailure);
      const denied = path.startsWith("/api/")
        ? NextResponse.json(
            { code: result.code, error: result.error },
            { status: result.status },
          )
        : NextResponse.redirect(
            new URL(
              `/security-check?next=${encodeURIComponent(path + request.nextUrl.search)}`,
              request.url,
            ),
          );
      for (const cookie of response.cookies.getAll())
        denied.cookies.set(cookie);
      return denied;
    }
  }

  return response;
}
