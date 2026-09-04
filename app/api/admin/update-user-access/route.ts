import { NextRequest, NextResponse } from "next/server";

import {
  createSupabaseAdmin,
  requireWebsiteAdmin,
} from "@/lib/server/admin-api";

type CanonicalRole =
  | "admin"
  | "hseq"
  | "asset_manager"
  | "commercial"
  | "editor"
  | "crew"
  | "viewer";

type UpdateUserBody = {
  user_id?: string;
  website_role?: string;
  role?: string;
  mobile_role?: string;
  employee_id?: string | null;
  crew_id?: string | null;
  project_ids?: string[];
};

const CANONICAL_ROLES = new Set<CanonicalRole>([
  "admin",
  "hseq",
  "asset_manager",
  "commercial",
  "editor",
  "crew",
  "viewer",
]);

function normalizeRole(value: unknown): CanonicalRole | null {
  const role = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!role) return null;

  switch (role) {
    case "admin":
    case "administrator":
    case "site_admin":
      return "admin";

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

export async function POST(request: NextRequest) {
  try {
    await requireWebsiteAdmin(request);

    const supabaseAdmin = createSupabaseAdmin();
    const body = (await request.json()) as UpdateUserBody;

    const userId = String(body.user_id ?? "").trim();

    const websiteRole =
      normalizeRole(body.website_role ?? body.role) ?? null;

    const mobileRole =
      normalizeRole(body.mobile_role) ?? null;

    const projectIds = Array.isArray(body.project_ids)
      ? [
          ...new Set(
            body.project_ids
              .map((projectId) => String(projectId ?? "").trim())
              .filter(Boolean),
          ),
        ]
      : [];

    if (!userId) {
      return NextResponse.json(
        { error: "User ID is required." },
        { status: 400 },
      );
    }

    if (!websiteRole || !CANONICAL_ROLES.has(websiteRole)) {
      return NextResponse.json(
        { error: "Invalid website role." },
        { status: 400 },
      );
    }

    if (!mobileRole || !CANONICAL_ROLES.has(mobileRole)) {
      return NextResponse.json(
        { error: "Invalid mobile role." },
        { status: 400 },
      );
    }

    /*
     * WEBSITE ROLE
     *
     * Keep one current website role per user. Delete + insert is retained
     * because older TTTracker databases may not have a user_id UNIQUE
     * constraint suitable for upsert.
     */
    const { error: deleteWebsiteRoleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (deleteWebsiteRoleError) {
      throw new Error(
        `Unable to clear website role: ${deleteWebsiteRoleError.message}`,
      );
    }

    const { error: insertWebsiteRoleError } = await supabaseAdmin
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
     *
     * Mobile now uses the same canonical organisational role set as the
     * website. Feature access should be resolved from permissions rather
     * than maintaining a second legacy mechanic/leading_hand role model.
     */
    const { error: deleteMobileRoleError } = await supabaseAdmin
      .from("user_mobile_roles")
      .delete()
      .eq("user_id", userId);

    if (deleteMobileRoleError) {
      throw new Error(
        `Unable to clear mobile role: ${deleteMobileRoleError.message}`,
      );
    }

    const { error: insertMobileRoleError } = await supabaseAdmin
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
    const { error: clearEmployeeError } = await supabaseAdmin
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
      const employeeId = String(body.employee_id).trim();

      const { data: conflictingEmployee, error: conflictingEmployeeError } =
        await supabaseAdmin
          .from("employees")
          .select("id,full_name,user_id")
          .eq("id", employeeId)
          .maybeSingle();

      if (conflictingEmployeeError) {
        throw new Error(
          `Unable to check employee link: ${conflictingEmployeeError.message}`,
        );
      }

      if (
        conflictingEmployee?.user_id &&
        conflictingEmployee.user_id !== userId
      ) {
        throw new Error(
          `${conflictingEmployee.full_name} is already linked to another login.`,
        );
      }

      const { error: employeeError } = await supabaseAdmin
        .from("employees")
        .update({
          user_id: userId,
          crew_id: body.crew_id || null,
        })
        .eq("id", employeeId);

      if (employeeError) {
        throw new Error(
          `Unable to link employee: ${employeeError.message}`,
        );
      }
    }

    /*
     * PROJECT ACCESS
     *
     * Project access uses the same canonical website role so downstream
     * project-level permission checks and Daily Docket reviewer resolution
     * see the user's current role consistently.
     */
    const { error: deleteProjectAccessError } = await supabaseAdmin
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

      const { error: projectAccessError } = await supabaseAdmin
        .from("project_access")
        .insert(projectRows);

      if (projectAccessError) {
        throw new Error(
          `Unable to save project access: ${projectAccessError.message}`,
        );
      }
    }

    /*
     * Read the saved values back before reporting success. This makes a
     * successful response mean the live database contains the requested
     * access rather than merely that the write calls did not throw.
     */
    const [
      websiteRoleResult,
      mobileRoleResult,
      projectAccessResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle(),

      supabaseAdmin
        .from("user_mobile_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle(),

      supabaseAdmin
        .from("project_access")
        .select("project_id,role")
        .eq("user_id", userId),
    ]);

    if (websiteRoleResult.error) {
      throw new Error(
        `Access was written but the website role could not be verified: ${websiteRoleResult.error.message}`,
      );
    }

    if (mobileRoleResult.error) {
      throw new Error(
        `Access was written but the mobile role could not be verified: ${mobileRoleResult.error.message}`,
      );
    }

    if (projectAccessResult.error) {
      throw new Error(
        `Access was written but project access could not be verified: ${projectAccessResult.error.message}`,
      );
    }

    const savedWebsiteRole = normalizeRole(
      websiteRoleResult.data?.role,
    );

    const savedMobileRole = normalizeRole(
      mobileRoleResult.data?.role,
    );

    const savedProjectIds = (projectAccessResult.data ?? [])
      .map((row) => String(row.project_id))
      .sort();

    const expectedProjectIds = [...projectIds].sort();

    const projectAccessMatches =
      savedProjectIds.length === expectedProjectIds.length &&
      savedProjectIds.every(
        (projectId, index) =>
          projectId === expectedProjectIds[index],
      );

    if (savedWebsiteRole !== websiteRole) {
      throw new Error(
        "The website role did not persist correctly.",
      );
    }

    if (savedMobileRole !== mobileRole) {
      throw new Error(
        "The mobile role did not persist correctly.",
      );
    }

    if (!projectAccessMatches) {
      throw new Error(
        "The selected project access did not persist correctly.",
      );
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      website_role: savedWebsiteRole,
      mobile_role: savedMobileRole,
      project_ids: savedProjectIds,
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
