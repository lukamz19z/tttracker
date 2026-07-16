import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type DeletePersonBody = {
  employee_id?: string | null;
  user_id?: string | null;
};

function getBearerToken(request: NextRequest): string {
  const authHeader = request.headers.get("authorization") ?? "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Supabase server configuration is incomplete." },
        { status: 500 },
      );
    }

    const token = getBearerToken(request);

    if (!token) {
      return NextResponse.json(
        { error: "Missing authentication token." },
        { status: 401 },
      );
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { error: "Invalid or expired session." },
        { status: 401 },
      );
    }

    const { data: roleRow, error: roleError } = await userClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    if (roleError || String(roleRow?.role ?? "").toLowerCase() !== "admin") {
      return NextResponse.json(
        { error: "Admin access is required." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as DeletePersonBody;
    const employeeId = String(body.employee_id ?? "").trim();
    const userId = String(body.user_id ?? "").trim();

    if (!employeeId) {
      return NextResponse.json(
        { error: "employee_id is required." },
        { status: 400 },
      );
    }

    if (userId && userId === user.id) {
      return NextResponse.json(
        { error: "You cannot permanently delete your own admin account." },
        { status: 400 },
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    if (userId) {
      const cleanupTables = [
        "project_access",
        "user_mobile_roles",
        "user_roles",
        "notification_preferences",
        "user_push_tokens",
      ];

      for (const table of cleanupTables) {
        const { error } = await admin.from(table).delete().eq("user_id", userId);

        if (
          error &&
          !error.message.toLowerCase().includes("does not exist") &&
          !error.message.toLowerCase().includes("relation")
        ) {
          return NextResponse.json(
            { error: `Could not clear ${table}: ${error.message}` },
            { status: 500 },
          );
        }
      }
    }

    const { error: employeeError } = await admin
      .from("employees")
      .delete()
      .eq("id", employeeId);

    if (employeeError) {
      return NextResponse.json(
        { error: employeeError.message },
        { status: 500 },
      );
    }

    if (userId) {
      const { error: deleteUserError } =
        await admin.auth.admin.deleteUser(userId);

      if (deleteUserError) {
        return NextResponse.json(
          {
            error:
              "Employee profile was deleted, but the login account could not be removed: " +
              deleteUserError.message,
          },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to permanently delete person.",
      },
      { status: 500 },
    );
  }
}