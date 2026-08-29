import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export const runtime = "nodejs";

type RouteRuleInput = {
  id?: string;
  name?: string;
  route_pattern?: string;
  match_type?: "exact" | "prefix";
  access_area_id?: string;
  priority?: number;
  is_active?: boolean;
};

function requiredEnv(name: string) {
  const value = process.env[name];

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
  const authHeader =
    request.headers.get("authorization") ?? "";

  const token = authHeader
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) {
    throw new Error(
      "Missing authentication token.",
    );
  }

  const supabaseUrl =
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL");

  const anonKey =
    requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  const serviceKey =
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  const authClient =
    createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

  const {
    data: { user },
    error: userError,
  } =
    await authClient.auth.getUser(token);

  if (
    userError ||
    !user
  ) {
    throw new Error(
      "You must be logged in.",
    );
  }

  /*
   * Generic SupabaseClient is intentional here.
   *
   * The route/access tables were added after TTTracker's generated
   * Supabase TypeScript definitions, so binding this client to stale
   * generated database types can make the new tables resolve as `never`.
   */
  const service: SupabaseClient =
    createClient(
      supabaseUrl,
      serviceKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
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
      .eq("user_id", user.id)
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
      .toLowerCase() !== "admin"
  ) {
    throw new Error(
      "Administrator access is required.",
    );
  }

  return service;
}

export async function GET(
  request: NextRequest,
) {
  try {
    const service =
      await getAdminService(request);

    const [
      rulesResult,
      areasResult,
    ] =
      await Promise.all([
        service
          .from("access_route_rule_details")
          .select("*")
          .order(
            "priority",
            {
              ascending: false,
            },
          )
          .order(
            "route_pattern",
            {
              ascending: true,
            },
          ),

        service
          .from("access_areas")
          .select(`
            id,
            code,
            name,
            type,
            permission_level,
            is_active,
            access_groups (
              id,
              code,
              name,
              sort_order
            )
          `)
          .eq(
            "is_active",
            true,
          )
          .in(
            "type",
            [
              "tttracker",
              "module",
              "admin",
            ],
          )
          .order("name"),
      ]);

    if (rulesResult.error) {
      throw new Error(
        rulesResult.error.message,
      );
    }

    if (areasResult.error) {
      throw new Error(
        areasResult.error.message,
      );
    }

    return NextResponse.json({
      rules:
        rulesResult.data ?? [],

      accessAreas:
        areasResult.data ?? [],
    });
  } catch (error) {
    console.error(
      "ROUTE RULE LOAD ERROR:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Could not load route rules.";

    const status =
      message.includes("logged in")
        ? 401
        : message.includes("Administrator")
          ? 403
          : 500;

    return NextResponse.json(
      {
        error: message,
      },
      {
        status,
      },
    );
  }
}

export async function POST(
  request: NextRequest,
) {
  try {
    const service =
      await getAdminService(request);

    const body =
      (await request.json()) as RouteRuleInput;

    const id =
      String(
        body.id ?? "",
      ).trim();

    const name =
      String(
        body.name ?? "",
      ).trim();

    let routePattern =
      String(
        body.route_pattern ?? "",
      ).trim();

    const matchType =
      body.match_type === "exact"
        ? "exact"
        : "prefix";

    const accessAreaId =
      String(
        body.access_area_id ?? "",
      ).trim();

    const priority =
      Number.isFinite(
        Number(body.priority),
      )
        ? Number(body.priority)
        : 100;

    if (!name) {
      return NextResponse.json(
        {
          error:
            "Rule name is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!routePattern) {
      return NextResponse.json(
        {
          error:
            "Route pattern is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (
      !routePattern.startsWith("/")
    ) {
      routePattern =
        `/${routePattern}`;
    }

    if (
      routePattern.length > 1
    ) {
      routePattern =
        routePattern.replace(
          /\/+$/,
          "",
        );
    }

    if (!accessAreaId) {
      return NextResponse.json(
        {
          error:
            "Access area is required.",
        },
        {
          status: 400,
        },
      );
    }

    const payload = {
      name,
      route_pattern:
        routePattern,

      match_type:
        matchType,

      access_area_id:
        accessAreaId,

      priority,

      is_active:
        body.is_active !== false,
    };

    const query =
      id
        ? service
            .from("access_route_rules")
            .update(payload)
            .eq("id", id)
        : service
            .from("access_route_rules")
            .insert(payload);

    const {
      error,
    } =
      await query;

    if (error) {
      throw new Error(
        error.message,
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "ROUTE RULE SAVE ERROR:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Could not save route rule.";

    const status =
      message.includes("logged in")
        ? 401
        : message.includes("Administrator")
          ? 403
          : 500;

    return NextResponse.json(
      {
        error: message,
      },
      {
        status,
      },
    );
  }
}

export async function DELETE(
  request: NextRequest,
) {
  try {
    const service =
      await getAdminService(request);

    const id =
      request.nextUrl.searchParams
        .get("id")
        ?.trim();

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Rule id is required.",
        },
        {
          status: 400,
        },
      );
    }

    const {
      error,
    } =
      await service
        .from("access_route_rules")
        .delete()
        .eq("id", id);

    if (error) {
      throw new Error(
        error.message,
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error(
      "ROUTE RULE DELETE ERROR:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Could not delete route rule.";

    const status =
      message.includes("logged in")
        ? 401
        : message.includes("Administrator")
          ? 403
          : 500;

    return NextResponse.json(
      {
        error: message,
      },
      {
        status,
      },
    );
  }
}