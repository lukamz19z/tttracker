import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

type UserRoleRow = {
  user_id: string;
  role: string | null;
};

export async function GET() {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

    const supabaseAdmin = createSupabaseAdmin();

    const { data: authUsers, error: authError } =
      await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, role");

    if (rolesError) {
      return NextResponse.json({ error: rolesError.message }, { status: 400 });
    }

    const roleMap = new Map<string, string>(
      ((roles || []) as UserRoleRow[]).map((row) => [
        row.user_id,
        row.role || "viewer",
      ]),
    );

    const users = authUsers.users.map((user) => ({
      user_id: user.id,
      email: user.email || "",
      role: roleMap.get(user.id) || "viewer",
      created_at: user.created_at,
      last_sign_in_at: user.last_sign_in_at,
    }));

    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
