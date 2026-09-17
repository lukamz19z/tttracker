import { NextRequest, NextResponse } from "next/server";

import {
  effectivePermissionsForUser,
  requireAccessAdmin,
  type AccessService,
} from "@/lib/access/server";
import { reconcileSharePointPermissions } from "@/lib/sharepoint/reconcile-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ userId: string }> };

type OverrideInput = {
  access_area_id?: unknown;
  allowed?: unknown;
};

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)),
  );
}

function cleanOverrides(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (row): row is OverrideInput => typeof row === "object" && row !== null,
    )
    .map((row) => ({
      access_area_id: String(row.access_area_id ?? "").trim(),
      allowed: row.allowed === true,
    }))
    .filter((row) => Boolean(row.access_area_id));
}

async function ensureIds(
  service: AccessService,
  table: "roles" | "projects" | "access_areas",
  ids: string[],
  activeOnly = false,
) {
  if (!ids.length) return;

  let query = service.from(table).select("id").in("id", ids);
  if (activeOnly) query = query.eq("is_active", true);

  const result = await query;
  if (result.error) throw new Error(result.error.message);

  const found = new Set((result.data ?? []).map((row) => String(row.id)));
  if (ids.some((id) => !found.has(id))) {
    throw new Error(`One or more selected ${table} records are invalid.`);
  }
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { service } = await requireAccessAdmin(request);
    const { userId } = await context.params;
    const targetUserId = String(userId ?? "").trim();

    if (!targetUserId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    const target = await service.auth.admin.getUserById(targetUserId);
    if (target.error || !target.data.user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const [
      assignments,
      overrides,
      projectAccess,
      mapping,
      employee,
      effective,
    ] = await Promise.all([
      service
        .from("user_role_assignments")
        .select(
          "role_id,roles(id,code,name,description,is_active,is_system,grants_all,sort_order)",
        )
        .eq("user_id", targetUserId),
      service
        .from("user_permission_overrides")
        .select("access_area_id,allowed")
        .eq("user_id", targetUserId),
      service
        .from("project_access")
        .select("project_id,role")
        .eq("user_id", targetUserId),
      service
        .from("sharepoint_user_mappings")
        .select("microsoft_email,is_enabled")
        .eq("user_id", targetUserId)
        .maybeSingle(),
      service
        .from("employees")
        .select("id,full_name,role,active")
        .eq("user_id", targetUserId)
        .maybeSingle(),
      effectivePermissionsForUser(service, targetUserId),
    ]);

    const failures = [
      assignments.error,
      overrides.error,
      projectAccess.error,
      mapping.error,
      employee.error,
    ].filter(Boolean);

    if (failures.length) {
      throw new Error(failures[0]?.message ?? "Could not load user access.");
    }

    const assignmentRows = assignments.data ?? [];
    const roles = assignmentRows
      .flatMap((row) => {
        const related = row.roles;
        if (!related) return [];
        return Array.isArray(related) ? related : [related];
      })
      .filter(Boolean);

    return NextResponse.json({
      user: {
        id: target.data.user.id,
        email: target.data.user.email ?? null,
      },
      role_ids: Array.from(
        new Set(assignmentRows.map((row) => String(row.role_id))),
      ),
      roles,
      overrides: overrides.data ?? [],
      project_access: projectAccess.data ?? [],
      sharepoint: mapping.data ?? {
        microsoft_email: target.data.user.email ?? null,
        is_enabled: true,
      },
      employee: employee.data ?? null,
      effective,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load user access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: NextRequest, context: Context) {
  try {
    const { user: administrator, service } = await requireAccessAdmin(request);
    const { userId } = await context.params;
    const targetUserId = String(userId ?? "").trim();

    if (!targetUserId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    const target = await service.auth.admin.getUserById(targetUserId);
    if (target.error || !target.data.user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const body = await request.json();
    const roleIds = stringArray(body.role_ids);
    const projectIds = stringArray(body.project_ids);
    const overrides = cleanOverrides(body.overrides);
    const microsoftEmail = String(body.microsoft_email ?? "").trim() || null;
    const sharepointEnabled = body.sharepoint_enabled !== false;

    if (!roleIds.length) {
      return NextResponse.json(
        { error: "Assign at least one role to the user." },
        { status: 400 },
      );
    }

    await Promise.all([
      ensureIds(service, "roles", roleIds, true),
      ensureIds(service, "projects", projectIds),
      ensureIds(
        service,
        "access_areas",
        Array.from(new Set(overrides.map((row) => row.access_area_id))),
        true,
      ),
    ]);

    const [currentRoles, currentProjects] = await Promise.all([
      service
        .from("user_role_assignments")
        .select("role_id")
        .eq("user_id", targetUserId),
      service
        .from("project_access")
        .select("project_id")
        .eq("user_id", targetUserId),
    ]);

    if (currentRoles.error) throw new Error(currentRoles.error.message);
    if (currentProjects.error) throw new Error(currentProjects.error.message);

    const currentRoleIds = new Set(
      (currentRoles.data ?? []).map((row) => String(row.role_id)),
    );
    const nextRoleIds = new Set(roleIds);

    const removeRoleIds = [...currentRoleIds].filter(
      (roleId) => !nextRoleIds.has(roleId),
    );
    const addRoleIds = [...nextRoleIds].filter(
      (roleId) => !currentRoleIds.has(roleId),
    );

    if (removeRoleIds.length) {
      const removed = await service
        .from("user_role_assignments")
        .delete()
        .eq("user_id", targetUserId)
        .in("role_id", removeRoleIds);
      if (removed.error) throw new Error(removed.error.message);
    }

    if (addRoleIds.length) {
      const added = await service.from("user_role_assignments").insert(
        addRoleIds.map((roleId) => ({
          user_id: targetUserId,
          role_id: roleId,
          assigned_by: administrator.id,
        })),
      );
      if (added.error) throw new Error(added.error.message);
    }

    const currentProjectIds = new Set(
      (currentProjects.data ?? []).map((row) => String(row.project_id)),
    );
    const nextProjectIds = new Set(projectIds);

    const removeProjectIds = [...currentProjectIds].filter(
      (projectId) => !nextProjectIds.has(projectId),
    );
    const addProjectIds = [...nextProjectIds].filter(
      (projectId) => !currentProjectIds.has(projectId),
    );

    if (removeProjectIds.length) {
      const removed = await service
        .from("project_access")
        .delete()
        .eq("user_id", targetUserId)
        .in("project_id", removeProjectIds);
      if (removed.error) throw new Error(removed.error.message);
    }

    if (addProjectIds.length) {
      const added = await service.from("project_access").insert(
        addProjectIds.map((projectId) => ({
          user_id: targetUserId,
          project_id: projectId,
        })),
      );
      if (added.error) throw new Error(added.error.message);
    }

    const clearedOverrides = await service
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", targetUserId);
    if (clearedOverrides.error) throw new Error(clearedOverrides.error.message);

    if (overrides.length) {
      const savedOverrides = await service.from("user_permission_overrides").insert(
        overrides.map((row) => ({
          user_id: targetUserId,
          access_area_id: row.access_area_id,
          allowed: row.allowed,
          updated_at: new Date().toISOString(),
        })),
      );
      if (savedOverrides.error) throw new Error(savedOverrides.error.message);
    }

    const mapping = await service.from("sharepoint_user_mappings").upsert(
      {
        user_id: targetUserId,
        microsoft_email: microsoftEmail,
        is_enabled: sharepointEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (mapping.error) throw new Error(mapping.error.message);

    let sharepointSync: unknown = null;
    let sharepointWarning: string | null = null;

    try {
      sharepointSync = await reconcileSharePointPermissions(service);
    } catch (error) {
      sharepointWarning =
        error instanceof Error ? error.message : "SharePoint reconciliation failed.";
      console.error("SHAREPOINT USER ACCESS RECONCILE WARNING:", error);
    }

    return NextResponse.json({
      success: true,
      user_id: targetUserId,
      role_ids: roleIds,
      project_ids: projectIds,
      overrides,
      sharepoint_sync: sharepointSync,
      sharepoint_warning: sharepointWarning,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not save user access.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
