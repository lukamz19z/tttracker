import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

type WebsiteRole =
  | "admin"
  | "finance"
  | "hseq"
  | "asset_manager"
  | "commercial"
  | "editor"
  | "crew"
  | "viewer";

const WEBSITE_ROLES: WebsiteRole[] = [
  "admin",
  "finance",
  "hseq",
  "asset_manager",
  "commercial",
  "editor",
  "crew",
  "viewer",
];

function isWebsiteRole(value: unknown): value is WebsiteRole {
  return WEBSITE_ROLES.includes(value as WebsiteRole);
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

    const body = (await req.json()) as {
      user_id?: string;
      role?: string;
      website_role?: string;
    };

    const userId = String(
      body.user_id ?? "",
    ).trim();

    /*
     * The current Admin page sends both website_role and role.
     * Prefer website_role but retain role for backward compatibility.
     */
    const role = String(
      body.website_role ??
        body.role ??
        "",
    )
      .trim()
      .toLowerCase();

    if (!userId) {
      return NextResponse.json(
        { error: "Missing user_id." },
        { status: 400 },
      );
    }

    if (!isWebsiteRole(role)) {
      return NextResponse.json(
        { error: "Invalid website role." },
        { status: 400 },
      );
    }

    const supabaseAdmin =
      createSupabaseAdmin();

    const {
      error,
    } =
      await supabaseAdmin
        .from("user_roles")
        .upsert(
          {
            user_id: userId,
            role,
          },
          {
            onConflict: "user_id",
          },
        );

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      role,
    });
  } catch (error) {
    console.error(
      "UPDATE USER ACCESS ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      },
      { status: 500 },
    );
  }
}
