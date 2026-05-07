import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "admin" | "editor" | "viewer";

export async function POST(req: Request) {
  try {
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

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

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