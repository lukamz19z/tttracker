import { NextRequest, NextResponse } from "next/server";
import { requireAccessAdmin } from "@/lib/access/server";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ roleId: string }> },
) {
  try {
    const { service } = await requireAccessAdmin(request);
    const { roleId } = await context.params;
    const body = await request.json();

    const existing = await service
      .from("roles")
      .select("id,is_system,grants_all")
      .eq("id", roleId)
      .single();

    if (existing.error || !existing.data) throw new Error("Role not found.");

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.description !== undefined) {
      patch.description = String(body.description).trim() || null;
    }
    if (body.sort_order !== undefined) patch.sort_order = Number(body.sort_order);
    if (body.is_active !== undefined && !existing.data.is_system) {
      patch.is_active = Boolean(body.is_active);
    }

    const result = await service
      .from("roles")
      .update(patch)
      .eq("id", roleId)
      .select(
        "id,code,name,description,is_active,is_system,grants_all,sort_order",
      )
      .single();

    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ role: result.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ roleId: string }> },
) {
  try {
    const { service } = await requireAccessAdmin(request);
    const { roleId } = await context.params;

    const existing = await service
      .from("roles")
      .select("id,name,is_system")
      .eq("id", roleId)
      .single();

    if (existing.error || !existing.data) throw new Error("Role not found.");
    if (existing.data.is_system) {
      return NextResponse.json(
        { error: "System roles cannot be deleted." },
        { status: 400 },
      );
    }

    const assignmentCount = await service
      .from("user_role_assignments")
      .select("id", { count: "exact", head: true })
      .eq("role_id", roleId);

    if (assignmentCount.error) throw new Error(assignmentCount.error.message);
    if ((assignmentCount.count ?? 0) > 0) {
      return NextResponse.json(
        {
          error: `${assignmentCount.count} user(s) are still assigned to this role. Remove or replace those assignments first.`,
        },
        { status: 409 },
      );
    }

    const result = await service.from("roles").delete().eq("id", roleId);
    if (result.error) throw new Error(result.error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete role.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
