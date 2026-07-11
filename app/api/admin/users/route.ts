import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

type WebsiteRole = "admin" | "editor" | "viewer";

type MobileRole =
  | "admin"
  | "leading_hand"
  | "mechanic"
  | "crew";

type UserRoleRow = {
  user_id: string;
  role: WebsiteRole | null;
};

type MobileRoleRow = {
  user_id: string;
  role: MobileRole | null;
};

type EmployeeRow = {
  id: string;
  full_name: string;
  role: string | null;
  crew_id: string | null;
  active: boolean | null;
  user_id: string | null;
  shirt_size: string | null;
  jacket_size: string | null;
  glove_size: string | null;
  pants_size: string | null;
};

type ProjectAccessRow = {
  user_id: string;
  project_id: string;
  role: WebsiteRole | null;
};

export async function GET() {
  try {
    const auth = await requireAdmin();

    if (auth.response) {
      return auth.response;
    }

    const supabaseAdmin = createSupabaseAdmin();

    const [
      authUsersResult,
      websiteRolesResult,
      mobileRolesResult,
      employeesResult,
      projectAccessResult,
      projectsResult,
      crewsResult,
    ] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      }),

      supabaseAdmin
        .from("user_roles")
        .select("user_id, role"),

      supabaseAdmin
        .from("user_mobile_roles")
        .select("user_id, role"),

      supabaseAdmin
        .from("employees")
        .select(`
          id,
          full_name,
          role,
          crew_id,
          active,
          user_id,
          shirt_size,
          jacket_size,
          glove_size,
          pants_size
        `)
        .order("full_name"),

      supabaseAdmin
        .from("project_access")
        .select("user_id, project_id, role"),

      supabaseAdmin
        .from("projects")
        .select(`
          id,
          name,
          project_number,
          location,
          status
        `)
        .order("name"),

      supabaseAdmin
        .from("crews")
        .select(`
          id,
          crew_number,
          crew_name,
          leading_hand,
          active
        `)
        .order("crew_number"),
    ]);

    const firstError =
      authUsersResult.error ||
      websiteRolesResult.error ||
      mobileRolesResult.error ||
      employeesResult.error ||
      projectAccessResult.error ||
      projectsResult.error ||
      crewsResult.error;

    if (firstError) {
      return NextResponse.json(
        {
          error: firstError.message,
        },
        {
          status: 400,
        },
      );
    }

    const websiteRoleMap = new Map<string, WebsiteRole>();

    for (const row of (websiteRolesResult.data ?? []) as UserRoleRow[]) {
      websiteRoleMap.set(
        row.user_id,
        row.role ?? "viewer",
      );
    }

    const mobileRoleMap = new Map<string, MobileRole>();

    for (const row of (mobileRolesResult.data ?? []) as MobileRoleRow[]) {
      mobileRoleMap.set(
        row.user_id,
        row.role ?? "crew",
      );
    }

    const employeeMap = new Map<string, EmployeeRow>();

    for (const employee of (employeesResult.data ?? []) as EmployeeRow[]) {
      if (employee.user_id) {
        employeeMap.set(employee.user_id, employee);
      }
    }

    const projectAccessMap = new Map<
      string,
      Array<{
        project_id: string;
        role: WebsiteRole;
      }>
    >();

    for (
      const row of
      (projectAccessResult.data ?? []) as ProjectAccessRow[]
    ) {
      const current = projectAccessMap.get(row.user_id) ?? [];

      current.push({
        project_id: row.project_id,
        role: row.role ?? "viewer",
      });

      projectAccessMap.set(row.user_id, current);
    }

    const users = authUsersResult.data.users.map((user) => ({
      user_id: user.id,
      email: user.email ?? "",
      website_role:
        websiteRoleMap.get(user.id) ?? "viewer",
      mobile_role:
        mobileRoleMap.get(user.id) ?? "crew",
      created_at: user.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      employee:
        employeeMap.get(user.id) ?? null,
      project_access:
        projectAccessMap.get(user.id) ?? [],
    }));

    return NextResponse.json({
      users,
      employees: employeesResult.data ?? [],
      projects: projectsResult.data ?? [],
      crews: crewsResult.data ?? [],
    });
  } catch (error) {
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