import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  reconcileSharePointPermissions,
} from "@/lib/sharepoint/permissions";

export const runtime = "nodejs";

function requiredEnv(
  name: string,
) {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

async function getAdminService(
  request: NextRequest,
): Promise<SupabaseClient> {
  const token =
    (
      request.headers.get(
        "authorization",
      ) ?? ""
    )
      .replace(
        /^Bearer\s+/i,
        "",
      )
      .trim();

  if (!token) {
    throw new Error(
      "Missing authentication token.",
    );
  }

  const url =
    requiredEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
    );

  const authClient =
    createClient(
      url,
      requiredEnv(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      ),
      {
        global: {
          headers: {
            Authorization:
              `Bearer ${token}`,
          },
        },
        auth: {
          persistSession:
            false,
          autoRefreshToken:
            false,
        },
      },
    );

  const {
    data: { user },
    error: userError,
  } =
    await authClient.auth
      .getUser(token);

  if (
    userError ||
    !user
  ) {
    throw new Error(
      "You must be logged in.",
    );
  }

  const service:
    SupabaseClient =
    createClient(
      url,
      requiredEnv(
        "SUPABASE_SERVICE_ROLE_KEY",
      ),
      {
        auth: {
          persistSession:
            false,
          autoRefreshToken:
            false,
        },
      },
    );

  const {
    data: roleRow,
    error: roleError,
  } =
    await service
      .from("user_roles")
      .select("role")
      .eq(
        "user_id",
        user.id,
      )
      .maybeSingle();

  if (roleError) {
    throw new Error(
      roleError.message,
    );
  }

  if (
    String(
      roleRow?.role ?? "",
    )
      .trim()
      .toLowerCase() !==
    "admin"
  ) {
    throw new Error(
      "Administrator access is required.",
    );
  }

  return service;
}

export async function POST(
  request: NextRequest,
) {
  try {
    const service =
      await getAdminService(
        request,
      );

    const result =
      await reconcileSharePointPermissions(
        service,
      );

    return NextResponse.json({
      success:
        result.failed ===
        0,
      result,
    });
  } catch (error) {
    console.error(
      "SHAREPOINT RECONCILE ERROR:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Could not reconcile SharePoint permissions.";

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status:
          message.includes(
            "Administrator",
          )
            ? 403
            : message.includes(
                  "logged in",
                )
              ? 401
              : 500,
      },
    );
  }
}