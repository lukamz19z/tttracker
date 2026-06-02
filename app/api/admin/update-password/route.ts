import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

    const body = (await req.json()) as {
      user_id?: string;
      password?: string;
    };

    if (!body.user_id || !body.password) {
      return NextResponse.json(
        { error: "Missing user_id or password" },
        { status: 400 },
      );
    }

    if (body.password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    const { error } = await supabaseAdmin.auth.admin.updateUserById(
      body.user_id,
      {
        password: body.password,
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
