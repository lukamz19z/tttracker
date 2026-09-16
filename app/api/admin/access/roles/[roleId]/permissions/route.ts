import { NextRequest, NextResponse } from "next/server";
import { requireAccessAdmin } from "@/lib/access/server";
import { reconcileSharePointPermissions } from "@/lib/sharepoint/reconcile-permissions";

export const runtime = "nodejs";

type PermissionInput = {
  access_area_id?: unknown;
  allowed?: unknown;
};

type CleanPermission = {
  access_area_id: string;
  allowed: boolean;
};

function isPermissionInput(value: unknown): value is PermissionInput {
  return typeof value === "object" && value !== null;
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ roleId: string }> },
) {
  try {
    const { service } = await requireAccessAdmin(request);
    const { roleId } = await context.params;
    const body = (await request.json()) as { permissions?: unknown };

    const permissions = Array.isArray(body.permissions) ? body.permissions : [];
    const role = await service
      .from("roles")
      .select("id,is_system,grants_all")
      .eq("id", roleId)
      .single();

    if (role.error || !role.data) throw new Error("Role not found.");
    if (role.data.grants_all) {
      return NextResponse.json({
        success: true,
        note: "Full-access role automatically grants every active permission.",
      });
    }

    const clean: CleanPermission[] = permissions
      .filter(isPermissionInput)
      .map((row) => ({
        access_area_id: String(row.access_area_id ?? "").trim(),
        allowed: row.allowed === true,
      }))
      .filter((row) => Boolean(row.access_area_id));

    const removed = await service
      .from("role_permissions")
      .delete()
      .eq("role_id", roleId);
    if (removed.error) throw new Error(removed.error.message);

    const granted = clean
      .filter((row) => row.allowed)
      .map((row) => ({
        role_id: roleId,
        access_area_id: row.access_area_id,
        allowed: true,
        updated_at: new Date().toISOString(),
      }));

    if (granted.length) {
      const inserted = await service.from("role_permissions").insert(granted);
      if (inserted.error) throw new Error(inserted.error.message);
    }

    const sharepointSync = await reconcileSharePointPermissions(service);

    return NextResponse.json({ success: true, sharepoint_sync: sharepointSync });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not save role permissions.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
