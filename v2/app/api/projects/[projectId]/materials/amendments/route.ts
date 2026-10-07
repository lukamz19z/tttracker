import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";
import { materialActorUserId } from "@/lib/materials/project-actor";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(projectId, String(body.organisationId ?? "") || null, "manage_amendments");
    await validateMaterialsRequest(project, body);
    const admin = createSupabaseAdmin();
    const orgId = project.dataOrganisationId;
    if (!String(body.title ?? "").trim()) throw new Error("Amendment title is required.");
    if (!String(body.scopeKey ?? "").trim()) throw new Error("Amendment scope is required.");

    const { data: amendment, error } = await admin.from("v2_material_amendments").insert({
      organisation_id: orgId,
      project_id: projectId,
      amendment_number: body.amendmentNumber || null,
      title: String(body.title).trim(),
      reference_type_key: body.referenceTypeKey || null,
      reference_number: body.referenceNumber || null,
      scope_key: String(body.scopeKey),
      tower_id: body.towerId || null,
      tower_type: body.towerType || null,
      drawing_reference: body.drawingReference || null,
      drawing_revision: body.drawingRevision || null,
      segment: body.segment || null,
      reason: body.reason || null,
      status_key: body.statusKey || "draft",
      effective_from: body.effectiveFrom || null,
      document_url: body.documentUrl || null,
      created_by: materialActorUserId(project),
      approved_by: body.statusKey === "approved" ? materialActorUserId(project) : null,
      approved_at: body.statusKey === "approved" ? new Date().toISOString() : null,
      origin_organisation_id: orgId,
      visibility_scope: "origin_only",
    }).select("id").single();
    if (error) throw new Error(error.message);

    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length) {
      const rows = items.map((item: Record<string, unknown>) => ({
        amendment_id: amendment.id,
        base_material_item_id: item.baseMaterialItemId || null,
        action_key: String(item.actionKey ?? "note"),
        material_kind: String(item.materialKind ?? "member"),
        item_reference: item.itemReference || null,
        description: item.description || null,
        segment: item.segment || null,
        drawing_reference: item.drawingReference || null,
        drawing_revision: item.drawingRevision || null,
        profile: item.profile || null,
        diameter: item.diameter || null,
        length: item.length || null,
        bolt_type: item.boltType || null,
        packer_mark: item.packerMark || null,
        quantity: item.quantity == null ? null : Number(item.quantity),
        unit: item.unit || null,
        quantity_basis_key: item.quantityBasisKey || null,
        notes: item.notes || null,
      }));
      const { error: itemError } = await admin.from("v2_material_amendment_items").insert(rows);
      if (itemError) throw new Error(itemError.message);
    }

    return NextResponse.json({ ok: true, amendment });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}
