import { NextRequest, NextResponse } from "next/server";
import { requireAccessAdmin } from "@/lib/access/server";
import { reconcileSharePointPermissions } from "@/lib/sharepoint/reconcile-permissions";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;

  try {
    const { service, user: actor } = await requireAccessAdmin(request);
    const body = await request.json();

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const roleIds = Array.from(new Set(
      (Array.isArray(body.role_ids) ? body.role_ids : [])
        .map((value: unknown) => String(value ?? "").trim())
        .filter(Boolean),
    ));
    const projectIds = Array.from(new Set(
      (Array.isArray(body.project_ids) ? body.project_ids : [])
        .map((value: unknown) => String(value ?? "").trim())
        .filter(Boolean),
    ));

    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });

    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (created.error || !created.data.user) {
      throw new Error(created.error?.message ?? "Could not create login account.");
    }

    createdUserId = created.data.user.id;

    if (roleIds.length) {
      const result = await service.from("user_role_assignments").insert(
        roleIds.map((roleId) => ({
          user_id: createdUserId,
          role_id: roleId,
          assigned_by: actor.id,
        })),
      );
      if (result.error) throw new Error(result.error.message);
    }

    if (projectIds.length) {
      const result = await service.from("project_access").insert(
        projectIds.map((projectId) => ({
          user_id: createdUserId,
          project_id: projectId,
          role: "viewer",
        })),
      );
      if (result.error) throw new Error(result.error.message);
    }

    const microsoftEmail = String(body.microsoft_email ?? email).trim().toLowerCase();
    const mapping = await service.from("sharepoint_user_mappings").upsert(
      {
        user_id: createdUserId,
        microsoft_email: microsoftEmail || null,
        is_enabled: body.sharepoint_enabled !== false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (mapping.error) throw new Error(mapping.error.message);

    const sharepointSync = await reconcileSharePointPermissions(service);

    return NextResponse.json({
      success: true,
      user_id: createdUserId,
      sharepoint_sync: sharepointSync,
    });
  } catch (error) {
    // If auth creation succeeded but a later database step failed, remove the
    // half-created account so Admin can retry cleanly.
    if (createdUserId) {
      try {
        const { service } = await requireAccessAdmin(request);
        await service.auth.admin.deleteUser(createdUserId);
      } catch {
        // Best-effort rollback only.
      }
    }

    const message = error instanceof Error ? error.message : "Could not create user.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
