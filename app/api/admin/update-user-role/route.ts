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

function normalizeWebsiteRole(
  value: unknown,
): WebsiteRole | null {
  const role = String(value ?? "")
    .trim()
    .toLowerCase()
    .replaceAll(" ", "_");

  if (!role) return null;

  switch (role) {
    case "admin":
    case "administrator":
    case "site_admin":
      return "admin";

    case "finance":
    case "financial":
    case "finance_manager":
    case "accounts":
      return "finance";

    case "hseq":
    case "safety":
    case "safety_manager":
      return "hseq";

    case "asset_manager":
    case "assets":
    case "mechanic":
      return "asset_manager";

    case "commercial":
    case "commercial_manager":
      return "commercial";

    case "editor":
      return "editor";

    case "crew":
    case "field":
    case "leading_hand":
      return "crew";

    case "viewer":
      return "viewer";

    default:
      return null;
  }
}

function isWebsiteRole(
  value: WebsiteRole | null,
): value is WebsiteRole {
  return Boolean(
    value &&
      WEBSITE_ROLES.includes(value),
  );
}

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (auth.response) return auth.response;

    const body = (await req.json()) as {
      user_id?: string;
      userId?: string;
      role?: string;
      website_role?: string;
      websiteRole?: string;
    };

    const userId = String(
      body.user_id ??
        body.userId ??
        "",
    ).trim();

    const rawRole =
      body.website_role ??
      body.websiteRole ??
      body.role ??
      "";

    const role =
      normalizeWebsiteRole(rawRole);

    if (!userId) {
      return NextResponse.json(
        {
          error:
            "Missing user_id.",
        },
        {
          status: 400,
        },
      );
    }

    if (!isWebsiteRole(role)) {
      return NextResponse.json(
        {
          error:
            `Invalid website role: "${String(
              rawRole,
            )}".`,
          accepted_roles:
            WEBSITE_ROLES,
        },
        {
          status: 400,
        },
      );
    }

    const supabaseAdmin =
      createSupabaseAdmin();

    /*
     * Keep one current website role per user.
     *
     * Delete + insert is used instead of upsert because older
     * TTTracker databases may not have a UNIQUE(user_id)
     * constraint on user_roles.
     */
    const {
      error:
        deleteRoleError,
    } =
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq(
          "user_id",
          userId,
        );

    if (deleteRoleError) {
      return NextResponse.json(
        {
          error:
            `Unable to clear website role: ${deleteRoleError.message}`,
        },
        {
          status: 400,
        },
      );
    }

    const {
      error:
        insertRoleError,
    } =
      await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id:
            userId,
          role,
        });

    if (insertRoleError) {
      return NextResponse.json(
        {
          error:
            `Unable to save website role: ${insertRoleError.message}`,
        },
        {
          status: 400,
        },
      );
    }

    const {
      data:
        savedRoleRow,
      error:
        verifyError,
    } =
      await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq(
          "user_id",
          userId,
        )
        .maybeSingle();

    if (verifyError) {
      return NextResponse.json(
        {
          error:
            `Website role was written but could not be verified: ${verifyError.message}`,
        },
        {
          status: 500,
        },
      );
    }

    const savedRole =
      normalizeWebsiteRole(
        savedRoleRow?.role,
      );

    if (
      savedRole !== role
    ) {
      return NextResponse.json(
        {
          error:
            "The website role did not persist correctly.",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      role: savedRole,
      website_role: savedRole,
    });
  } catch (error) {
    console.error(
      "UPDATE USER ROLE ERROR:",
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      },
      {
        status: 500,
      },
    );
  }
}
