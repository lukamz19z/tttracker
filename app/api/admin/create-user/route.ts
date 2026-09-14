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

function normaliseWebsiteRole(value: unknown): string {
  const role = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (role === "administrator" || role === "site_admin") return "admin";
  if (role === "financial" || role === "finance_manager" || role === "accounts") {
    return "finance";
  }
  if (role === "safety" || role === "safety_manager") return "hseq";
  if (role === "assets" || role === "mechanic") return "asset_manager";
  if (role === "commercial_manager") return "commercial";
  if (role === "leading_hand" || role === "field") return "crew";

  return role;
}

function isWebsiteRole(value: string): value is WebsiteRole {
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
      websiteRole?: string;
    };

    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();

    const password = String(body.password ?? "");

    const rawRole =
      body.website_role ??
      body.websiteRole ??
      body.role ??
      "";

    const role = normaliseWebsiteRole(rawRole);

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
        {
          error: `Invalid website role: "${String(rawRole)}".`,
          received: rawRole,
          accepted: WEBSITE_ROLES,
        },
        { status: 400 },
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    const { data, error } =
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

    const userId = data.user?.id;

    if (!userId) {
      return NextResponse.json(
        { error: "The login account was created but no user ID was returned." },
        { status: 500 },
      );
    }

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role,
      });

    if (roleError) {
      const { error: cleanupError } =
        await supabaseAdmin.auth.admin.deleteUser(userId);

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
    console.error("CREATE USER ERROR:", error);

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
