import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";
import { materialActorUserId } from "@/lib/materials/project-actor";

type Context = { params: Promise<{ projectId: string; movementId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { projectId, movementId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(projectId, String(body.organisationId ?? "") || null, "manage_movements");
    await validateMaterialsRequest(project, { ...body, movementId });
    const admin = createSupabaseAdmin();
    const action = String(body.action ?? "receive");

    if (action === "receive") {
      const { error } = await admin.from("v2_material_movements").update({ status: "received", received_by: materialActorUserId(project), received_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", movementId).eq("project_id", projectId);
      if (error) throw new Error(error.message);
    } else if (action === "cancel") {
      const { error } = await admin.from("v2_material_movements").update({ status: "cancelled", cancelled_by: materialActorUserId(project), cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", movementId).eq("project_id", projectId);
      if (error) throw new Error(error.message);
    } else {
      throw new Error("Invalid movement action.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}
