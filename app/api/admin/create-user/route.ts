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
      email?: string;
      password?: string;
      role?: string;
      website_role?: string;
    };

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    const password = String(body.password ?? "");

    /*
     * The current Admin page sends both:
     *   website_role
     *   role
     *
     * Accept website_role first, with role retained for backward
     * compatibility with older Admin forms.
     */
    const role = String(
      body.website_role ??
        body.role ??
        "",
    )
      .trim()
      .toLowerCase();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 },
      );
    }

    if (!password) {
      return NextResponse.json(
        { error: "Password is required." },
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
      data,
      error,
    } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    const userId =
      data.user?.id;

    if (!userId) {
      return NextResponse.json(
        {
          error:
            "The login account was created but no user ID was returned.",
        },
        { status: 500 },
      );
    }

    const {
      error: roleError,
    } =
      await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: userId,
          role,
        });

    if (roleError) {
      /*
       * Avoid leaving behind a login with no website role when
       * the user_roles insert fails.
       */
      const {
        error: cleanupError,
      } =
        await supabaseAdmin.auth.admin.deleteUser(
          userId,
        );

      if (cleanupError) {
        console.error(
          "Could not clean up Auth user after role insert failed:",
          cleanupError,
        );
      }

      return NextResponse.json(
        { error: roleError.message },
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
      "CREATE USER ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Server error",
      },
      { status: 500 },
    );
  }
}
