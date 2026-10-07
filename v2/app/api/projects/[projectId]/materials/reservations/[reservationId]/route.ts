import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";

type Context = { params: Promise<{ projectId: string; reservationId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { projectId, reservationId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(projectId, String(body.organisationId ?? "") || null, "manage_reservations");
    await validateMaterialsRequest(project, { ...body, reservationId });
    const admin = createSupabaseAdmin();
    const status = String(body.status ?? "released");
    if (!["released", "cancelled", "fulfilled"].includes(status)) throw new Error("Invalid reservation status.");
    const { error } = await admin.from("v2_material_reservations").update({ status, released_at: new Date().toISOString() }).eq("id", reservationId).eq("project_id", projectId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}
