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
        { error: "User ID is required." },
        { status: 400 },
      );
    }

    if (!WEBSITE_ROLES.has(websiteRole)) {
      return NextResponse.json(
        { error: "Invalid website role." },
        { status: 400 },
      );
    }

    if (!MOBILE_ROLES.has(mobileRole)) {
      return NextResponse.json(
        { error: "Invalid mobile role." },
        { status: 400 },
      );
    }

    /*
     * WEBSITE ROLE
     *
     * Delete and insert instead of relying on an ON CONFLICT
     * constraint that may not exist on the older user_roles table.
     */
    const { error: deleteWebsiteRoleError } =
      await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

    if (deleteWebsiteRoleError) {
      throw new Error(
        `Unable to clear website role: ${deleteWebsiteRoleError.message}`,
      );
    }

    const { error: insertWebsiteRoleError } =
      await supabaseAdmin
        .from("user_roles")
        .insert({
          user_id: userId,
          role: websiteRole,
        });

    if (insertWebsiteRoleError) {
      throw new Error(
        `Unable to save website role: ${insertWebsiteRoleError.message}`,
      );
    }

    /*
     * MOBILE ROLE
     */
    const { error: deleteMobileRoleError } =
      await supabaseAdmin
        .from("user_mobile_roles")
        .delete()
        .eq("user_id", userId);

    if (deleteMobileRoleError) {
      throw new Error(
        `Unable to clear mobile role: ${deleteMobileRoleError.message}`,
      );
    }

    const { error: insertMobileRoleError } =
      await supabaseAdmin
        .from("user_mobile_roles")
        .insert({
          user_id: userId,
          role: mobileRole,
        });

    if (insertMobileRoleError) {
      throw new Error(
        `Unable to save mobile role: ${insertMobileRoleError.message}`,
      );
    }

    /*
     * EMPLOYEE LINK
     */
    const { error: clearEmployeeError } =
      await supabaseAdmin
        .from("employees")
        .update({
          user_id: null,
        })
        .eq("user_id", userId);

    if (clearEmployeeError) {
      throw new Error(
        `Unable to clear employee link: ${clearEmployeeError.message}`,
      );
    }

    if (body.employee_id) {
      const { data: conflictingEmployee } =
        await supabaseAdmin
          .from("employees")
          .select("id,full_name,user_id")
          .eq("id", body.employee_id)
          .maybeSingle();

      if (
        conflictingEmployee?.user_id &&
        conflictingEmployee.user_id !== userId
      ) {
        throw new Error(
          `${conflictingEmployee.full_name} is already linked to another login.`,
        );
      }

      const { error: employeeError } =
        await supabaseAdmin
          .from("employees")
          .update({
            user_id: userId,
            crew_id: body.crew_id || null,
          })
          .eq("id", body.employee_id);

      if (employeeError) {
        throw new Error(
          `Unable to link employee: ${employeeError.message}`,
        );
      }
    }

    /*
     * PROJECT ACCESS
     */
    const { error: deleteProjectAccessError } =
      await supabaseAdmin
        .from("project_access")
        .delete()
        .eq("user_id", userId);

    if (deleteProjectAccessError) {
      throw new Error(
        `Unable to clear project access: ${deleteProjectAccessError.message}`,
      );
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
        throw new Error(
          `Unable to save project access: ${projectAccessError.message}`,
        );
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