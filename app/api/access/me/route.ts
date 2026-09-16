import { NextRequest, NextResponse } from "next/server";
import {
  createServiceClient,
  effectivePermissionsForUser,
  getRequestUser,
} from "@/lib/access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PermissionRow = {
  code: string;
  type: string | null;
};

type RoleSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_system: boolean;
  grants_all: boolean;
};

type RoleAssignmentRow = {
  roles: RoleSummary | RoleSummary[] | null;
};

type ProjectAccessRow = {
  project_id: string;
  role: string | null;
};

function firstRole(value: RoleAssignmentRow["roles"]): RoleSummary | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getRequestUser(request);
    const service = createServiceClient();

    const [permissionRows, roleRows, projectRows] = await Promise.all([
      effectivePermissionsForUser(service, user.id),
      service
        .from("user_role_assignments")
        .select("role_id,roles(id,code,name,description,is_system,grants_all)")
        .eq("user_id", user.id),
      service
        .from("project_access")
        .select("project_id,role")
        .eq("user_id", user.id),
    ]);

    if (roleRows.error) throw new Error(roleRows.error.message);
    if (projectRows.error) throw new Error(projectRows.error.message);

    const permissions = permissionRows as PermissionRow[];
    const roleAssignments = (roleRows.data ?? []) as RoleAssignmentRow[];
    const projects = (projectRows.data ?? []) as ProjectAccessRow[];

    const grouped = {
      web: permissions
        .filter((row) => row.type === "tttracker")
        .map((row) => row.code),
      mobile: permissions
        .filter((row) => row.type === "mobile")
        .map((row) => row.code),
      sharepoint: permissions
        .filter((row) => row.type === "sharepoint")
        .map((row) => row.code),
    };

    return NextResponse.json({
      user: { id: user.id, email: user.email ?? null },
      roles: roleAssignments
        .map((row) => firstRole(row.roles))
        .filter((role): role is RoleSummary => role !== null),
      projects,
      permissions: grouped,
      allPermissions: permissionRows,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load access.";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
