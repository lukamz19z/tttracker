import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ liftTemplateId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { service, user } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { liftTemplateId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const sourceRevisionId = typeof body.revisionId === "string" ? body.revisionId : "";
    if (!name || !sourceRevisionId) liftInvalid("New Lift Template name and source revision are required.");
    const { data: source, error: sourceError } = await service.from("lift_erection_templates").select("tower_template_id,description,method_tags,crane_suitability").eq("id", liftTemplateId).maybeSingle();
    if (sourceError) throw new Error(sourceError.message);
    if (!source) liftInvalid("Lift Template was not found.");
    const { data: sourceRevision, error: revisionError } = await service.from("lift_erection_template_revisions").select("*").eq("id", sourceRevisionId).eq("lift_template_id", liftTemplateId).maybeSingle();
    if (revisionError) throw new Error(revisionError.message);
    if (!sourceRevision) liftInvalid("Source Lift Template revision was not found.");
    const { data: template, error: templateError } = await service.from("lift_erection_templates").insert({ tower_template_id: source.tower_template_id, name, description: source.description, method_tags: source.method_tags, crane_suitability: source.crane_suitability, created_by: user.id }).select("*").single();
    if (templateError || !template) throw new Error(templateError?.message || "Duplicate Lift Template was not returned.");
    const { data: revision, error: createError } = await service.from("lift_erection_template_revisions").insert({ lift_template_id: template.id, tower_template_revision_id: sourceRevision.tower_template_revision_id, revision: "Rev A", status: "draft", description: sourceRevision.description, method_tags: sourceRevision.method_tags, crane_suitability: sourceRevision.crane_suitability, notes: sourceRevision.notes, created_by: user.id }).select("*").single();
    if (createError || !revision) { await service.from("lift_erection_templates").delete().eq("id", template.id); throw new Error(createError?.message || "Draft revision was not returned."); }
    const { data: lifts, error: liftsError } = await service.from("lift_erection_template_lifts").select("*").eq("lift_template_revision_id", sourceRevisionId).order("sequence_no");
    if (liftsError) throw new Error(liftsError.message);
    for (const lift of lifts ?? []) {
      const { data: copy, error } = await service.from("lift_erection_template_lifts").insert({ lift_template_revision_id: revision.id, lift_number: lift.lift_number, name: lift.name, description: lift.description, sequence_no: lift.sequence_no, lift_type: lift.lift_type, additional_mass_kg: lift.additional_mass_kg, erection_method: lift.erection_method, crane_suitability: lift.crane_suitability, notes: lift.notes }).select("id").single();
      if (error || !copy) throw new Error(error?.message || "Lift sequence could not be duplicated.");
      const { data: allocations, error: allocationError } = await service.from("lift_erection_template_lift_sections").select("tower_template_section_id,allocated_quantity,portion,notes").eq("lift_template_lift_id", lift.id);
      if (allocationError) throw new Error(allocationError.message);
      if (allocations?.length) {
        const { error: insertError } = await service.from("lift_erection_template_lift_sections").insert(allocations.map((row) => ({ ...row, lift_template_lift_id: copy.id })));
        if (insertError) throw new Error(insertError.message);
      }
    }
    return NextResponse.json({ ok: true, liftTemplate: template, revision }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
