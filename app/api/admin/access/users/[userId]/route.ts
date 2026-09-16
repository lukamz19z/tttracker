import { NextRequest, NextResponse } from "next/server";
import {
  requireAccessAdmin,
  type AccessService,
} from "@/lib/access/server";
import { reconcileSharePointPermissions } from "@/lib/sharepoint/reconcile-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoleSummary = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_system: boolean;
  grants_all: boolean;
};

type RoleAssignmentRow = {
  role_id: string;
  roles: RoleSummary | RoleSummary[] | null;
};

type OverrideInput = {
  access_area_id?: unknown;
  allowed?: unknown;
};

type CleanOverride = {
  access_area_id: string;
  allowed: boolean;
};

type ProjectAccessRow = {
  project_id: string;
  role: string | null;
};

type CurrentRoleAssignment = {
  role_id: string;
};

function isOverrideInput(value: unknown): value is OverrideInput {
  return typeof value === "object" && value !== null;
}

function firstRole(value: RoleAssignmentRow["roles"]): RoleSummary | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

async function loadUser(service: AccessService, userId: string) {
  const [roles, overrides, projectAccess, mapping, employee, effective] =
    await Promise.all([
      service
        .from("user_role_assignments")
        .select(
          "role_id,roles(id,code,name,description,is_active,is_system,grants_all)",
        )
        .eq("user_id", userId),
      service
        .from("user_permission_overrides")
        .select("access_area_id,allowed")
        .eq("user_id", userId),
      service
        .from("project_access")
        .select("project_id,role")
        .eq("user_id", userId),
      service
        .from("sharepoint_user_mappings")
        .select("microsoft_email,is_enabled")
        .eq("user_id", userId)
        .maybeSingle(),
      service
        .from("employees")
        .select("id,full_name,role,user_id,active")
        .eq("user_id", userId)
        .maybeSingle(),
      service
        .from("effective_user_permissions")
        .select(
          "access_area_id,code,name,type,permission_level,allowed,source",
        )
        .eq("user_id", userId),
    ]);

  for (const result of [
    roles,
    overrides,
    projectAccess,
    mapping,
    employee,
    effective,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const roleRows = (roles.data ?? []) as RoleAssignmentRow[];

  return {
    roles: roleRows
      .map((row) => firstRole(row.roles))
      .filter((role): role is RoleSummary => role !== null),
    role_ids: roleRows.map((row) => row.role_id),
    overrides: overrides.data ?? [],
    project_access: projectAccess.data ?? [],
    sharepoint: mapping.data ?? { microsoft_email: null, is_enabled: true },
    employee: employee.data ?? null,
    effective: effective.data ?? [],
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { service } = await requireAccessAdmin(request);
    const { userId } = await context.params;

    const authUser = await service.auth.admin.getUserById(userId);
    if (authUser.error || !authUser.data.user) {
      throw new Error("User not found.");
    }

    const access = await loadUser(service, userId);
    return NextResponse.json({
      user: {
        id: authUser.data.user.id,
        email: authUser.data.user.email ?? null,
        created_at: authUser.data.user.created_at,
        last_sign_in_at: authUser.data.user.last_sign_in_at ?? null,
      },
      ...access,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load user access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ userId: string }> },
) {
  try {
    const { service, user: actor } = await requireAccessAdmin(request);
    const { userId } = await context.params;
    const body = (await request.json()) as {
      role_ids?: unknown;
      project_ids?: unknown;
      overrides?: unknown;
      microsoft_email?: unknown;
      sharepoint_enabled?: unknown;
    };

    const roleIds = Array.from(
      new Set(
        (Array.isArray(body.role_ids) ? body.role_ids : [])
          .map((value: unknown) => String(value ?? "").trim())
          .filter(Boolean),
      ),
    );

    const projectIds = Array.from(
      new Set(
        (Array.isArray(body.project_ids) ? body.project_ids : [])
          .map((value: unknown) => String(value ?? "").trim())
          .filter(Boolean),
      ),
    );

    const overrides: CleanOverride[] = (
      Array.isArray(body.overrides) ? body.overrides : []
    )
      .filter(isOverrideInput)
      .filter((row) => row.allowed === true || row.allowed === false)
      .map((row) => ({
        access_area_id: String(row.access_area_id ?? "").trim(),
        allowed: row.allowed === true,
      }))
      .filter((row) => Boolean(row.access_area_id));

    const currentAssignments = await service
      .from("user_role_assignments")
      .select("role_id")
      .eq("user_id", userId);
    if (currentAssignments.error) {
      throw new Error(currentAssignments.error.message);
    }

    const currentRows = (currentAssignments.data ?? []) as CurrentRoleAssignment[];
    const currentIds = new Set(currentRows.map((row) => row.role_id));
    const wantedIds = new Set(roleIds);

    const removeIds = [...currentIds].filter((id) => !wantedIds.has(id));
    const addIds = roleIds.filter((id) => !currentIds.has(id));

    for (const roleId of removeIds) {
      const result = await service
        .from("user_role_assignments")
        .delete()
        .eq("user_id", userId)
        .eq("role_id", roleId);
      if (result.error) throw new Error(result.error.message);
    }

    if (addIds.length) {
      const result = await service.from("user_role_assignments").insert(
        addIds.map((roleId) => ({
          user_id: userId,
          role_id: roleId,
          assigned_by: actor.id,
        })),
      );
      if (result.error) throw new Error(result.error.message);
    }

    const deletedOverrides = await service
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", userId);
    if (deletedOverrides.error) {
      throw new Error(deletedOverrides.error.message);
    }

    if (overrides.length) {
      const inserted = await service.from("user_permission_overrides").insert(
        overrides.map((row) => ({
          user_id: userId,
          access_area_id: row.access_area_id,
          allowed: row.allowed,
        })),
      );
      if (inserted.error) throw new Error(inserted.error.message);
    }

    const currentProjects = await service
      .from("project_access")
      .select("project_id,role")
      .eq("user_id", userId);
    if (currentProjects.error) {
      throw new Error(currentProjects.error.message);
    }

    const currentProjectRows = (currentProjects.data ?? []) as ProjectAccessRow[];
    const currentProjectIds = new Set(
      currentProjectRows.map((row) => row.project_id),
    );
    const wantedProjectIds = new Set(projectIds);
    const removeProjectIds = [...currentProjectIds].filter(
      (id) => !wantedProjectIds.has(id),
    );
    const addProjectIds = projectIds.filter(
      (id) => !currentProjectIds.has(id),
    );

    if (removeProjectIds.length) {
      const projectDelete = await service
        .from("project_access")
        .delete()
        .eq("user_id", userId)
        .in("project_id", removeProjectIds);
      if (projectDelete.error) throw new Error(projectDelete.error.message);
    }

    if (addProjectIds.length) {
      const projectInsert = await service.from("project_access").insert(
        addProjectIds.map((projectId) => ({
          user_id: userId,
          project_id: projectId,
          role: "viewer",
        })),
      );
      if (projectInsert.error) throw new Error(projectInsert.error.message);
    }

    const microsoftEmail =
      String(body.microsoft_email ?? "").trim().toLowerCase() || null;
    const sharepointEnabled = body.sharepoint_enabled !== false;
    const mapping = await service.from("sharepoint_user_mappings").upsert(
      {
        user_id: userId,
        microsoft_email: microsoftEmail,
        is_enabled: sharepointEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (mapping.error) throw new Error(mapping.error.message);

    const sharepointSync = await reconcileSharePointPermissions(service);

    return NextResponse.json({
      success: true,
      sharepoint_sync: sharepointSync,
      ...(await loadUser(service, userId)),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not update user access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
