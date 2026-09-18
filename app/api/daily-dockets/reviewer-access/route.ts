import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { isConfiguredBcReviewer } from "@/lib/dockets/reviewers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function createRouteSupabase() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase server configuration is missing.");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Cookie writes can be unavailable in some server contexts.
        }
      },
    },
  });
}

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Supabase service configuration is missing. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = String(url.searchParams.get("projectId") || "").trim();

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required." },
        { status: 400 },
      );
    }

    const supabase = await createRouteSupabase();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "You must be signed in to check Daily Docket reviewer access." },
        { status: 401 },
      );
    }

    const service = createServiceClient();
    const allowed = await isConfiguredBcReviewer(
      service,
      projectId,
      user.id,
    );

    return NextResponse.json({
      allowed,
      projectId,
      userId: user.id,
    });
  } catch (error) {
    console.error("Daily Docket reviewer access check failed", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Daily Docket reviewer access could not be verified.",
      },
      { status: 500 },
    );
  }
}
