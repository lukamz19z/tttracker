import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createRequestResilientFetch, isTransientBackendFailure } from "./lib/backend-resilience";

/*
 * Next.js 16 uses proxy.ts for request interception.
 *
 * TTTracker page access is resolved centrally from
 * public.access_route_rules instead of being hard-coded
 * inside individual pages.
 */

export async function proxy(request: NextRequest) {
  const startedAt = Date.now();
  const pathname = request.nextUrl.pathname;
  const trace = request.headers.get("x-tttracker-web-trace") || `web-${crypto.randomUUID()}`;
  const traceHeaders = new Headers(request.headers);
  if (process.env.NODE_ENV === "development") traceHeaders.set("x-tttracker-web-trace", trace);
  const mark = (phase: string, since: number) => {
    if (process.env.NODE_ENV === "development") console.info("[web-trace]", { trace, path: pathname, prefetch: request.headers.has("next-router-prefetch"), phase, durationMs: Date.now() - since });
  };

  let response = NextResponse.next({
    request: { headers: traceHeaders },
  });

  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error(
      "TTTracker access proxy: Supabase environment variables are missing.",
    );

    /*
     * Fail open while rolling out the permission system.
     * Existing TTTracker authentication remains responsible
     * for protecting the application.
     */
    return response;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      global: { fetch: createRequestResilientFetch({ circuitBreaker: false }) },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },

        setAll(cookiesToSet) {
          cookiesToSet.forEach(
            ({ name, value }) => {
              request.cookies.set(
                name,
                value,
              );
            },
          );

          response = NextResponse.next({
            request: { headers: traceHeaders },
          });

          cookiesToSet.forEach(
            ({ name, value, options }) => {
              response.cookies.set(
                name,
                value,
                options,
              );
            },
          );
        },
      },
    },
  );

  const authStartedAt = Date.now();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  mark("auth", authStartedAt);

  /*
   * Let the existing TTTracker protected layout handle
   * unauthenticated users. This prevents this new access
   * layer from changing your current login flow.
   */
  if (userError || !user) {
    if (userError && isTransientBackendFailure(userError)) {
      console.warn("TTTracker auth verification temporarily unavailable; preserving request session state.");
    }
    return response;
  }

  const permissionStartedAt = Date.now();
  const {
    data: allowed,
    error: accessError,
  } = await supabase.rpc(
    "user_can_access_path",
    {
      p_user_id: user.id,
      p_path: pathname,
    },
  );
  mark("path_permission", permissionStartedAt);

  if (accessError) {
    console.error(
      "TTTracker route permission check failed:",
      accessError,
    );

    /*
     * Fail open during migration so a database/configuration
     * problem does not lock every user out of TTTracker.
     *
     * Once all route rules are proven in production, this can
     * be changed to fail closed.
     */
    return response;
  }

  if (allowed === false) {
    const url = request.nextUrl.clone();

    url.pathname = "/unauthorised";
    url.searchParams.set(
      "from",
      pathname,
    );

    mark("denied_total", startedAt);
    return NextResponse.redirect(url);
  }

  mark("total", startedAt);
  if (process.env.NODE_ENV === "development") response.headers.set("Server-Timing", `proxy;dur=${Date.now() - startedAt}`);
  return response;
}

export const config = {
  /*
   * Apply to normal application pages.
   *
   * API routes remain protected by their own action-level
   * permission checks and are intentionally excluded here.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|auth).*)",
  ],
};
