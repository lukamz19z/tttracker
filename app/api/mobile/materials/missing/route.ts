import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const clean = (value: unknown) => String(value ?? "").trim();
const positive = (value: unknown) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : 0; };

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const body = await request.json() as Record<string, unknown>;
    const projectId = clean(body.projectId);
    const towerId = clean(body.towerId);
    const clientMutationId = clean(body.clientMutationId);
    const quantity = positive(body.quantity);
    const description = clean(body.description);
    if (!projectId || !towerId || !clientMutationId || !quantity || !description) {
      return NextResponse.json({ error: "Project, tower, item, quantity and mutation ID are required." }, { status: 400 });
    }
    const [{ data: tower, error: towerError }, { data: access, error: accessError }] = await Promise.all([
      service.from("towers").select("id,project_id").eq("id", towerId).eq("project_id", projectId).maybeSingle(),
      service.from("project_access").select("project_id").eq("project_id", projectId).eq("user_id", identity.userId).maybeSingle(),
    ]);
    if (towerError || accessError) throw new Error(towerError?.message || accessError?.message);
    if (!tower) return NextResponse.json({ error: "Tower was not found in this project." }, { status: 404 });
    if (!access) return NextResponse.json({ error: "You do not have access to this project." }, { status: 403 });
    const result = await service.rpc("tttracker_v1_create_missing_material", {
      p_project_id: projectId,
      p_tower_id: towerId,
      p_client_mutation_id: clientMutationId,
      p_user_id: identity.userId,
      p_item: {
        sourceTable: clean(body.sourceTable) || null,
        sourceRecordId: clean(body.sourceRecordId) || null,
        materialType: clean(body.materialType) || null,
        boltSize: clean(body.boltSize) || null,
        itemReference: clean(body.itemReference) || description,
        description,
        quantity,
        unit: clean(body.unit) || "ea",
        notes: clean(body.itemNotes) || null,
        category: clean(body.category) || "Other",
        specification: clean(body.specification) || null,
        segment: clean(body.segment) || null,
        memberNumber: clean(body.memberNumber) || null,
        drawingNumber: clean(body.drawingNumber) || null,
      },
      p_urgency: clean(body.urgency) || null,
      p_required_by: clean(body.requiredBy) || null,
      p_notes: clean(body.notes) || null,
      p_occurred_at: clean(body.occurredAt) || new Date().toISOString(),
    });
    if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ ok: true, issue: result.data });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
