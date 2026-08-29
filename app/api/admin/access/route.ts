import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export const runtime = "nodejs";

type PermissionInput = {
  access_area_id?: unknown;
  allowed?: unknown;
};

type SaveAccessBody = {
  role_id?: unknown;
  access_area_id?: unknown;
  allowed?: unknown;
  permissions?: unknown;
};

function requiredEnv(name: string) {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function parseSaveAccessBody(
  value: unknown,
): SaveAccessBody {
  if (!isRecord(value)) {
    return {};
  }

  return {
    role_id:
      value.role_id,

    access_area_id:
      value.access_area_id,

    allowed:
      value.allowed,

    permissions:
      value.permissions,
  };
}

function parsePermissionInputs(
  value: unknown,
): PermissionInput[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((item) => ({
      access_area_id:
        item.access_area_id,

      allowed:
        item.allowed,
    }));
}

async function getAdminService(
  request: NextRequest,
): Promise<SupabaseClient> {
  const authHeader =
    request.headers.get(
      "authorization",
    ) ?? "";

  const token =
    authHeader
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

  const supabaseUrl =
    requiredEnv(
      "NEXT_PUBLIC_SUPABASE_URL",
    );

  const anonKey =
    requiredEnv(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );

  const serviceKey =
    requiredEnv(
      "SUPABASE_SERVICE_ROLE_KEY",
    );

  const authClient =
    createClient(
      supabaseUrl,
      anonKey,
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
    data: {
      user,
    },
    error:
      userError,
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

  /*
   * Use the generic SupabaseClient type rather than `any`.
   *
   * Your generated Supabase database types do not yet include
   * the new access-control tables, so deliberately avoid binding
   * this service-role client to those stale generated table types.
   */
  const service:
    SupabaseClient =
    createClient(
      supabaseUrl,
      serviceKey,
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
    data:
      roleRow,
    error:
      roleError,
  } =
    await service
      .from(
        "user_roles",
      )
      .select(
        "role",
      )
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
      roleRow?.role ??
        "",
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

export async function GET(
  request: NextRequest,
) {
  try {
    const service =
      await getAdminService(
        request,
      );

    const [
      rolesResult,
      matrixResult,
    ] =
      await Promise.all([
        service
          .from("roles")
          .select(`
            id,
            code,
            name,
            description,
            is_system,
            is_active
          `)
          .eq(
            "is_active",
            true,
          )
          .order(
            "name",
          ),

        service
          .from(
            "role_access_matrix",
          )
          .select("*")
          .order(
            "group_sort_order",
            {
              ascending:
                true,
              nullsFirst:
                false,
            },
          )
          .order(
            "access_sort_order",
            {
              ascending:
                true,
              nullsFirst:
                false,
            },
          ),
      ]);

    if (
      rolesResult.error
    ) {
      throw new Error(
        rolesResult.error.message,
      );
    }

    if (
      matrixResult.error
    ) {
      throw new Error(
        matrixResult.error.message,
      );
    }

    return NextResponse.json({
      roles:
        rolesResult.data ??
        [],

      matrix:
        matrixResult.data ??
        [],
    });
  } catch (error) {
    console.error(
      "ACCESS LOAD ERROR:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Could not load access permissions.";

    const status =
      message.includes(
        "logged in",
      )
        ? 401
        : message.includes(
              "Administrator",
            )
          ? 403
          : 500;

    return NextResponse.json(
      {
        error:
          message,
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
      await getAdminService(
        request,
      );

    const rawBody:
      unknown =
      await request.json();

    const body =
      parseSaveAccessBody(
        rawBody,
      );

    const roleId =
      String(
        body.role_id ??
          "",
      ).trim();

    if (!roleId) {
      return NextResponse.json(
        {
          error:
            "role_id is required.",
        },
        {
          status: 400,
        },
      );
    }

    const suppliedPermissions =
      parsePermissionInputs(
        body.permissions,
      );

    const permissions:
      PermissionInput[] =
      suppliedPermissions.length >
      0
        ? suppliedPermissions
        : [
            {
              access_area_id:
                body.access_area_id,

              allowed:
                body.allowed,
            },
          ];

    const rows =
      permissions
        .map(
          (
            permission,
          ) => ({
            role_id:
              roleId,

            access_area_id:
              String(
                permission.access_area_id ??
                  "",
              ).trim(),

            allowed:
              permission.allowed ===
              true,
          }),
        )
        .filter(
          (
            row,
          ) =>
            Boolean(
              row.access_area_id,
            ),
        );

    if (
      rows.length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            "At least one permission is required.",
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
        .from(
          "role_permissions",
        )
        .upsert(
          rows,
          {
            onConflict:
              "role_id,access_area_id",
          },
        );

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
      "ACCESS SAVE ERROR:",
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : "Could not save access permissions.";

    const status =
      message.includes(
        "logged in",
      )
        ? 401
        : message.includes(
              "Administrator",
            )
          ? 403
          : 500;

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status,
      },
    );
  }
}