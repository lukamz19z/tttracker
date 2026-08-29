import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/*
 * Next.js 16 uses proxy.ts for request interception.
 *
 * TTTracker page access is resolved centrally from
 * public.access_route_rules instead of being hard-coded
 * inside individual pages.
 */

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  let response = NextResponse.next({
    request,
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
            request,
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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  /*
   * Let the existing TTTracker protected layout handle
   * unauthenticated users. This prevents this new access
   * layer from changing your current login flow.
   */
  if (userError || !user) {
    return response;
  }

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

    return NextResponse.redirect(url);
  }

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