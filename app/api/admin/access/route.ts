import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type PermissionUpdate = {
  access_area_id: string;
  allowed: boolean;
};

type SaveAccessBody = {
  role_id?: string;
  access_area_id?: string;
  allowed?: boolean;
  permissions?: PermissionUpdate[];
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function requireAdmin(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return {
      error: NextResponse.json(
        { error: "You must be logged in." },
        { status: 401 },
      ),
      admin: null,
    };
  }

  const supabase = getAdminClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    return {
      error: NextResponse.json(
        { error: "Your session is invalid or expired." },
        { status: 401 },
      ),
      admin: null,
    };
  }

  const { data: roleRow, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (roleError) {
    return {
      error: NextResponse.json(
        { error: roleError.message },
        { status: 500 },
      ),
      admin: null,
    };
  }

  if (String(roleRow?.role ?? "").trim().toLowerCase() !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Administrator access is required." },
        { status: 403 },
      ),
      admin: null,
    };
  }

  return {
    error: null,
    admin: {
      user,
      supabase,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error || !auth.admin) return auth.error;

    const { supabase } = auth.admin;

    const [rolesResult, matrixResult] = await Promise.all([
      supabase
        .from("roles")
        .select("id, code, name, description, is_system, is_active")
        .eq("is_active", true)
        .order("name"),

      supabase
        .from("role_access_matrix")
        .select("*")
        .order("group_sort_order", { ascending: true })
        .order("access_sort_order", { ascending: true }),
    ]);

    if (rolesResult.error) {
      throw new Error(rolesResult.error.message);
    }

    if (matrixResult.error) {
      throw new Error(matrixResult.error.message);
    }

    return NextResponse.json({
      roles: rolesResult.data ?? [],
      matrix: matrixResult.data ?? [],
    });
  } catch (error) {
    console.error("ADMIN ACCESS GET ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load access configuration.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error || !auth.admin) return auth.error;

    const { supabase } = auth.admin;
    const body = (await request.json()) as SaveAccessBody;

    const roleId = String(body.role_id ?? "").trim();

    if (!roleId) {
      return NextResponse.json(
        { error: "role_id is required." },
        { status: 400 },
      );
    }

    let permissions: PermissionUpdate[] = [];

    if (Array.isArray(body.permissions)) {
      permissions = body.permissions
        .map((permission) => ({
          access_area_id: String(permission.access_area_id ?? "").trim(),
          allowed: Boolean(permission.allowed),
        }))
        .filter((permission) => permission.access_area_id);
    } else {
      const accessAreaId = String(body.access_area_id ?? "").trim();

      if (accessAreaId) {
        permissions = [
          {
            access_area_id: accessAreaId,
            allowed: Boolean(body.allowed),
          },
        ];
      }
    }

    if (permissions.length === 0) {
      return NextResponse.json(
        { error: "At least one permission is required." },
        { status: 400 },
      );
    }

    const rows = permissions.map((permission) => ({
      role_id: roleId,
      access_area_id: permission.access_area_id,
      allowed: permission.allowed,
    }));

    const { error: upsertError } = await supabase
      .from("role_permissions")
      .upsert(rows, {
        onConflict: "role_id,access_area_id",
      });

    if (upsertError) {
      throw new Error(upsertError.message);
    }

    return NextResponse.json({
      success: true,
      updated: rows.length,
    });
  } catch (error) {
    console.error("ADMIN ACCESS POST ERROR:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save access configuration.",
      },
      { status: 500 },
    );
  }
}