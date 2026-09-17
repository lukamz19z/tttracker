import { NextRequest, NextResponse } from "next/server";

import { requireAccessAdmin } from "@/lib/access/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item ?? "").trim()).filter(Boolean)),
  );
}

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;
  let serviceForRollback: Awaited<ReturnType<typeof requireAccessAdmin>>["service"] | null = null;

  try {
    const { user: administrator, service } = await requireAccessAdmin(request);
    serviceForRollback = service;

    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const roleIds = stringArray(body.role_ids);
    const projectIds = stringArray(body.project_ids);
    const microsoftEmail =
      String(body.microsoft_email ?? email).trim().toLowerCase() || null;
    const sharepointEnabled = body.sharepoint_enabled !== false;

    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 },
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: "The temporary password must be at least 8 characters." },
        { status: 400 },
      );
    }

    if (!roleIds.length) {
      return NextResponse.json(
        { error: "Assign at least one dynamic role to the new account." },
        { status: 400 },
      );
    }

    const [rolesResult, projectsResult] = await Promise.all([
      service.from("roles").select("id").in("id", roleIds).eq("is_active", true),
      projectIds.length
        ? service.from("projects").select("id").in("id", projectIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (rolesResult.error) throw new Error(rolesResult.error.message);
    if (projectsResult.error) throw new Error(projectsResult.error.message);

    if ((rolesResult.data ?? []).length !== roleIds.length) {
      return NextResponse.json(
        { error: "One or more selected roles are invalid." },
        { status: 400 },
      );
    }

    if ((projectsResult.data ?? []).length !== projectIds.length) {
      return NextResponse.json(
        { error: "One or more selected projects are invalid." },
        { status: 400 },
      );
    }

    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Could not create the login account.");
    }

    createdUserId = created.data.user.id;

    const roleInsert = await service.from("user_role_assignments").insert(
      roleIds.map((roleId) => ({
        user_id: createdUserId,
        role_id: roleId,
        assigned_by: administrator.id,
      })),
    );
    if (roleInsert.error) throw new Error(roleInsert.error.message);

    if (projectIds.length) {
      const projectInsert = await service.from("project_access").insert(
        projectIds.map((projectId) => ({
          user_id: createdUserId,
          project_id: projectId,
        })),
      );
      if (projectInsert.error) throw new Error(projectInsert.error.message);
    }

    const mapping = await service.from("sharepoint_user_mappings").upsert(
      {
        user_id: createdUserId,
        microsoft_email: microsoftEmail,
        is_enabled: sharepointEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (mapping.error) throw new Error(mapping.error.message);

    return NextResponse.json({
      success: true,
      user_id: createdUserId,
      email,
      role_ids: roleIds,
      project_ids: projectIds,
    });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);

    if (createdUserId && serviceForRollback) {
      try {
        await serviceForRollback.auth.admin.deleteUser(createdUserId);
      } catch (rollbackError) {
        console.error("CREATE USER ROLLBACK ERROR:", rollbackError);
      }
    }

    const message = error instanceof Error ? error.message : "Could not create user.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
