import { NextRequest, NextResponse } from "next/server";

import {
  createSupabaseAdmin,
  requireWebsiteAdmin,
} from "@/lib/server/admin-api";

type WebsiteRole = "admin" | "editor" | "viewer";

type MobileRole =
  | "admin"
  | "leading_hand"
  | "mechanic"
  | "crew";

type UpdateUserBody = {
  user_id?: string;
  website_role?: WebsiteRole;
  mobile_role?: MobileRole;
  employee_id?: string | null;
  crew_id?: string | null;
  project_ids?: string[];
};

const WEBSITE_ROLES = new Set<WebsiteRole>([
  "admin",
  "editor",
  "viewer",
]);

const MOBILE_ROLES = new Set<MobileRole>([
  "admin",
  "leading_hand",
  "mechanic",
  "crew",
]);

export async function POST(request: NextRequest) {
  try {
    await requireWebsiteAdmin(request);

    const supabaseAdmin = createSupabaseAdmin();
    const body = (await request.json()) as UpdateUserBody;

    const userId = body.user_id;
    const websiteRole = body.website_role ?? "viewer";
    const mobileRole = body.mobile_role ?? "crew";

    const projectIds = Array.isArray(body.project_ids)
      ? [...new Set(body.project_ids.filter(Boolean))]
      : [];

    if (!userId) {
      return NextResponse.json(
        {
          error: "User ID is required.",
        },
        {
          status: 400,
        },
      );
    }

    if (!WEBSITE_ROLES.has(websiteRole)) {
      return NextResponse.json(
        {
          error: "Invalid website role.",
        },
        {
          status: 400,
        },
      );
    }

    if (!MOBILE_ROLES.has(mobileRole)) {
      return NextResponse.json(
        {
          error: "Invalid mobile role.",
        },
        {
          status: 400,
        },
      );
    }

    const { error: websiteRoleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        {
          user_id: userId,
          role: websiteRole,
        },
        {
          onConflict: "user_id",
        },
      );

    if (websiteRoleError) {
      throw websiteRoleError;
    }

    const { error: mobileRoleError } = await supabaseAdmin
      .from("user_mobile_roles")
      .upsert(
        {
          user_id: userId,
          role: mobileRole,
        },
        {
          onConflict: "user_id",
        },
      );

    if (mobileRoleError) {
      throw mobileRoleError;
    }

    const { error: clearEmployeeError } = await supabaseAdmin
      .from("employees")
      .update({
        user_id: null,
      })
      .eq("user_id", userId);

    if (clearEmployeeError) {
      throw clearEmployeeError;
    }

    if (body.employee_id) {
      const { error: employeeError } = await supabaseAdmin
        .from("employees")
        .update({
          user_id: userId,
          crew_id: body.crew_id || null,
        })
        .eq("id", body.employee_id);

      if (employeeError) {
        throw employeeError;
      }
    }

    const { error: deleteProjectAccessError } =
      await supabaseAdmin
        .from("project_access")
        .delete()
        .eq("user_id", userId);

    if (deleteProjectAccessError) {
      throw deleteProjectAccessError;
    }

    if (projectIds.length > 0) {
      const projectRows = projectIds.map((projectId) => ({
        user_id: userId,
        project_id: projectId,
        role: websiteRole,
      }));

      const { error: projectAccessError } =
        await supabaseAdmin
          .from("project_access")
          .insert(projectRows);

      if (projectAccessError) {
        throw projectAccessError;
      }
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Update user access failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to update user access.",
      },
      {
        status: 500,
      },
    );
  }
}