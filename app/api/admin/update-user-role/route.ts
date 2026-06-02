import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

type Role = "admin" | "editor" | "viewer";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

    const body = (await req.json()) as {
      user_id?: string;
      role?: Role;
    };

    if (!body.user_id || !body.role) {
      return NextResponse.json(
        { error: "Missing user_id or role" },
        { status: 400 },
      );
    }

    if (!["admin", "editor", "viewer"].includes(body.role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdmin();

    const { error } = await supabaseAdmin.from("user_roles").upsert(
      {
        user_id: body.user_id,
        role: body.role,
      },
      {
        onConflict: "user_id",
      },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown server error" },
      { status: 500 },
    );
  }
}
