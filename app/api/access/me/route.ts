import { NextRequest, NextResponse } from "next/server";

import {
  createServiceClient,
  effectivePermissionsForUser,
  getRequestUser,
} from "@/lib/access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

type PermissionRow = {
  access_area_id: string;
  code: string;
  name: string;
  type: string | null;
  permission_level: string | null;
  allowed: boolean;
  source: string | null;
};

function firstRole(value: RoleAssignmentRow["roles"]): RoleSummary | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const trace = request.headers.get("x-tttracker-trace");
  const mark = (phase: string, since: number) => { if (process.env.NODE_ENV === "development" && trace) console.info("[web-trace]", { trace, route: "access_me", phase, durationMs: Date.now() - since }); };
  try {
    const authStartedAt = Date.now();
    const user = await getRequestUser(request);
    mark("auth", authStartedAt);
    const service = createServiceClient();

    const accessStartedAt = Date.now();
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
    mark("access_queries", accessStartedAt);

    if (roleRows.error) throw new Error(roleRows.error.message);
    if (projectRows.error) throw new Error(projectRows.error.message);

    const permissions = (permissionRows ?? []) as PermissionRow[];
    const roleAssignments = (roleRows.data ?? []) as RoleAssignmentRow[];
    const projects = (projectRows.data ?? []) as ProjectAccessRow[];

    const grouped = {
      web: unique(
        permissions
          .filter((row) => row.type === "tttracker")
          .map((row) => row.code),
      ),
      mobile: unique(
        permissions
          .filter((row) => row.type === "mobile")
          .map((row) => row.code),
      ),
      sharepoint: unique(
        permissions
          .filter((row) => row.type === "sharepoint")
          .map((row) => row.code),
      ),
    };

    const all = unique(permissions.map((row) => row.code));

    const serializeStartedAt = Date.now();
    const response = NextResponse.json(
      {
        user: { id: user.id, email: user.email ?? null },
        roles: roleAssignments
          .map((row) => firstRole(row.roles))
          .filter((role): role is RoleSummary => role !== null),
        projects,
        project_ids: unique(projects.map((row) => row.project_id)),
        is_admin: all.includes("tt.admin.access"),
        permissions: {
          all,
          ...grouped,
        },
        allPermissions: permissions,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          Pragma: "no-cache",
        },
      },
    );
    mark("serialize", serializeStartedAt);
    mark("total", startedAt);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load access.";

    const status = /logged in|authentication token/i.test(message) ? 401 : 403;

    return NextResponse.json(
      { error: message },
      {
        status,
        headers: { "Cache-Control": "no-store, max-age=0" },
      },
    );
  }
}
