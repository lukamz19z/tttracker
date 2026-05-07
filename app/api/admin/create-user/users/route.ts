import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: authUsers, error: authError } =
      await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");

    if (rolesError) {
      return NextResponse.json({ error: rolesError.message }, { status: 400 });
    }

    const roleMap = new Map(
      (roles || []).map((row) => [row.user_id, row.role]),
    );

    const users =
      authUsers.users.map((user) => ({
        user_id: user.id,
        email: user.email || "",
        role: roleMap.get(user.id) || "viewer",
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
      })) || [];

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 },
    );
  }
}