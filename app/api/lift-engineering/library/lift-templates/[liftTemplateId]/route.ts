import { NextResponse } from "next/server";
import { liftTemplateSteelWeightKg, type LiftSectionAllocation, type TowerSectionInput } from "@/lib/lift-engineering/tower-template";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ liftTemplateId: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { liftTemplateId } = await context.params;
    const requestedRevisionId = new URL(request.url).searchParams.get("revisionId");
    const { data: liftTemplate, error } = await service.from("lift_erection_templates").select("*").eq("id", liftTemplateId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!liftTemplate) return NextResponse.json({ error: "Lift Template was not found." }, { status: 404 });
    const { data: revisions, error: revisionsError } = await service.from("lift_erection_template_revisions").select("*").eq("lift_template_id", liftTemplateId).order("created_at", { ascending: false });
    if (revisionsError) throw new Error(revisionsError.message);
    const currentRevision = (revisions ?? []).find((row) => ["active", "verified"].includes(String(row.status).toLowerCase())) ?? revisions?.[0] ?? null;
    const selectedRevision = requestedRevisionId ? (revisions ?? []).find((row) => row.id === requestedRevisionId) ?? null : currentRevision;
    if (requestedRevisionId && !selectedRevision) return NextResponse.json({ error: "Lift Template revision was not found." }, { status: 404 });
    const { data: tower, error: towerError } = await service.from("lift_tower_templates").select("id,name,structure_type,tower_family,extension_configuration").eq("id", liftTemplate.tower_template_id).maybeSingle();
    if (towerError) throw new Error(towerError.message);
    const towerRevision = selectedRevision ? await service.from("lift_tower_template_revisions").select("*").eq("id", selectedRevision.tower_template_revision_id).maybeSingle() : { data: null, error: null };
    if (towerRevision.error) throw new Error(towerRevision.error.message);
    const sections = selectedRevision ? await service.from("lift_tower_template_sections").select("*").eq("tower_template_revision_id", selectedRevision.tower_template_revision_id).eq("active", true).order("sequence_no") : { data: [], error: null };
    if (sections.error) throw new Error(sections.error.message);
    const liftRows = selectedRevision ? await service.from("lift_erection_template_lifts").select("*").eq("lift_template_revision_id", selectedRevision.id).order("sequence_no") : { data: [], error: null };
    if (liftRows.error) throw new Error(liftRows.error.message);
    const liftIds = (liftRows.data ?? []).map((row) => row.id as string);
    const allocationRows = liftIds.length ? await service.from("lift_erection_template_lift_sections").select("*").in("lift_template_lift_id", liftIds) : { data: [], error: null };
    if (allocationRows.error) throw new Error(allocationRows.error.message);
    const sectionInputs = (sections.data ?? []) as TowerSectionInput[];
    const lifts = (liftRows.data ?? []).map((lift) => {
      const allocations = (allocationRows.data ?? []).filter((row) => row.lift_template_lift_id === lift.id) as LiftSectionAllocation[];
      let steelWeightKg = Number(lift.additional_mass_kg ?? 0);
      try { steelWeightKg = liftTemplateSteelWeightKg(allocations, sectionInputs, steelWeightKg); } catch { /* preserve details for the editor to surface */ }
      return { ...lift, allocations, steelWeightKg };
    });
    return NextResponse.json({ liftTemplate, revisions: revisions ?? [], currentRevision, selectedRevision, tower, towerRevision: towerRevision.data, sections: sections.data ?? [], lifts });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { liftTemplateId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const changes: Record<string, unknown> = {};
    if (typeof body.name === "string") { if (!body.name.trim()) liftInvalid("Lift Template name is required."); changes.name = body.name.trim(); }
    if (typeof body.description === "string" || body.description === null) changes.description = body.description;
    if (Array.isArray(body.methodTags)) changes.method_tags = body.methodTags.filter((tag): tag is string => typeof tag === "string").map((tag) => tag.trim()).filter(Boolean);
    if (body.craneSuitability && typeof body.craneSuitability === "object" && !Array.isArray(body.craneSuitability)) changes.crane_suitability = body.craneSuitability;
    if (!Object.keys(changes).length) liftInvalid("No Lift Template changes were provided.");
    changes.updated_at = new Date().toISOString();
    const { data, error } = await service.from("lift_erection_templates").update(changes).eq("id", liftTemplateId).select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Lift Template was not found." }, { status: 404 });
    return NextResponse.json({ ok: true, liftTemplate: data });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
