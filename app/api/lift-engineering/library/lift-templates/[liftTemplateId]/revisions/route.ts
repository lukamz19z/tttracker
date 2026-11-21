import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ liftTemplateId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { service, user } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { liftTemplateId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const revision = typeof body.revision === "string" ? body.revision.trim() : "";
    const towerRevisionId = typeof body.towerTemplateRevisionId === "string" ? body.towerTemplateRevisionId : "";
    const sourceRevisionId = typeof body.sourceRevisionId === "string" ? body.sourceRevisionId : "";
    if (!revision || !towerRevisionId) liftInvalid("Revision label and tower revision are required.");
    const [{ data: parent, error: parentError }, { data: towerRevision, error: towerError }] = await Promise.all([
      service.from("lift_erection_templates").select("id,tower_template_id").eq("id", liftTemplateId).maybeSingle(),
      service.from("lift_tower_template_revisions").select("id,template_id").eq("id", towerRevisionId).maybeSingle(),
    ]);
    if (parentError || towerError) throw new Error(parentError?.message || towerError?.message);
    if (!parent || !towerRevision || parent.tower_template_id !== towerRevision.template_id) liftInvalid("Selected tower revision does not belong to this Lift Template's tower.");
    let sourceLifts: Array<Record<string, unknown>> = [];
    let sourceAllocations: Array<Record<string, unknown>> = [];
    let copySequence = false;
    if (sourceRevisionId) {
      const { data: source, error } = await service.from("lift_erection_template_revisions").select("id,lift_template_id,tower_template_revision_id").eq("id", sourceRevisionId).maybeSingle();
      if (error) throw new Error(error.message);
      if (!source || source.lift_template_id !== liftTemplateId) liftInvalid("Source revision must belong to this Lift Template.");
      copySequence = source.tower_template_revision_id === towerRevisionId;
      if (copySequence) {
        const { data: rows, error: liftsError } = await service.from("lift_erection_template_lifts").select("*").eq("lift_template_revision_id", sourceRevisionId).order("sequence_no");
        if (liftsError) throw new Error(liftsError.message);
        sourceLifts = rows ?? [];
        if (sourceLifts.length) {
          const { data: allocations, error: allocationError } = await service.from("lift_erection_template_lift_sections").select("*").in("lift_template_lift_id", sourceLifts.map((row) => String(row.id)));
          if (allocationError) throw new Error(allocationError.message);
          sourceAllocations = allocations ?? [];
        }
      }
    }
    const { data: created, error: createError } = await service.from("lift_erection_template_revisions").insert({ lift_template_id: liftTemplateId, tower_template_revision_id: towerRevisionId, revision, status: "draft", created_by: user.id }).select("*").single();
    if (createError || !created) throw new Error(createError?.message || "Draft Lift Template revision was not returned.");
    try {
      if (copySequence) for (const source of sourceLifts) {
        const { data: copy, error: liftError } = await service.from("lift_erection_template_lifts").insert({ lift_template_revision_id: created.id, lift_number: source.lift_number, name: source.name, description: source.description, sequence_no: source.sequence_no, lift_type: source.lift_type, additional_mass_kg: source.additional_mass_kg, erection_method: source.erection_method, crane_suitability: source.crane_suitability, notes: source.notes }).select("id").single();
        if (liftError || !copy) throw new Error(liftError?.message || "Lift sequence could not be copied.");
        const allocations = sourceAllocations.filter((item) => item.lift_template_lift_id === source.id);
        if (allocations?.length) {
          const { error: insertError } = await service.from("lift_erection_template_lift_sections").insert(allocations.map((row) => ({ tower_template_section_id: row.tower_template_section_id, allocated_quantity: row.allocated_quantity, portion: row.portion, notes: row.notes, lift_template_lift_id: copy.id })));
          if (insertError) throw new Error(insertError.message);
        }
      }
    } catch (error) {
      await service.from("lift_erection_template_revisions").delete().eq("id", created.id);
      throw error;
    }
    return NextResponse.json({ ok: true, revision: created }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
