import { NextResponse } from "next/server";
import { liftTemplateSteelWeightKg, type LiftSectionAllocation, type TowerSectionInput } from "@/lib/lift-engineering/tower-template";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

type Context = { params: Promise<{ liftTemplateId: string }> };

async function getDraft(service: Awaited<ReturnType<typeof requireLiftAccess>>["service"], templateId: string, revisionId: string) {
  const { data: revision, error } = await service.from("lift_erection_template_revisions").select("id,lift_template_id,tower_template_revision_id,status").eq("id", revisionId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!revision || revision.lift_template_id !== templateId) liftInvalid("Lift Template revision was not found.");
  if (revision.status !== "draft") liftInvalid("Lift sequence can only be edited on a Draft Lift Template revision.");
  return revision;
}

export async function GET(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const { liftTemplateId } = await context.params;
    const revisionId = new URL(request.url).searchParams.get("revisionId");
    if (!revisionId) liftInvalid("Lift Template revision ID is required.");
    const { data: revision, error: revisionError } = await service.from("lift_erection_template_revisions").select("id,lift_template_id,tower_template_revision_id").eq("id", revisionId).maybeSingle();
    if (revisionError) throw new Error(revisionError.message);
    if (!revision || revision.lift_template_id !== liftTemplateId) liftInvalid("Lift Template revision does not belong to this Lift Template.");
    const { data: lifts, error } = await service.from("lift_erection_template_lifts").select("*").eq("lift_template_revision_id", revisionId).order("sequence_no");
    if (error) throw new Error(error.message);
    const ids = (lifts ?? []).map((lift) => lift.id as string);
    const [allocationsResult, sectionsResult] = await Promise.all([
      ids.length ? service.from("lift_erection_template_lift_sections").select("*").in("lift_template_lift_id", ids) : Promise.resolve({ data: [], error: null }),
      service.from("lift_tower_template_sections").select("*").eq("tower_template_revision_id", revision.tower_template_revision_id),
    ]);
    if (allocationsResult.error) throw new Error(allocationsResult.error.message);
    if (sectionsResult.error) throw new Error(sectionsResult.error.message);
    const sections = (sectionsResult.data ?? []) as TowerSectionInput[];
    const rows = (lifts ?? []).map((lift) => {
      const allocations = ((allocationsResult.data ?? []).filter((row) => row.lift_template_lift_id === lift.id)) as LiftSectionAllocation[];
      return { ...lift, allocations, steelWeightKg: liftTemplateSteelWeightKg(allocations, sections, Number(lift.additional_mass_kg ?? 0)) };
    });
    return NextResponse.json({ lifts: rows });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { liftTemplateId } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const revisionId = typeof body.revisionId === "string" ? body.revisionId : "";
    const lift = body.lift && typeof body.lift === "object" && !Array.isArray(body.lift) ? body.lift as Record<string, unknown> : {};
    const allocations = Array.isArray(body.allocations) ? body.allocations as Array<Record<string, unknown>> : [];
    if (!revisionId || typeof lift.name !== "string" || !lift.name.trim() || typeof lift.liftNumber !== "string" || !lift.liftNumber.trim()) liftInvalid("Draft revision, lift number and lift name are required.");
    const revision = await getDraft(service, liftTemplateId, revisionId);
    const sectionIds = [...new Set(allocations.map((item) => typeof item.tower_template_section_id === "string" ? item.tower_template_section_id : ""))].filter(Boolean);
    const { data: sections, error: sectionsError } = sectionIds.length
      ? await service.from("lift_tower_template_sections").select("id,name,quantity,unit_weight_kg,active").eq("tower_template_revision_id", revision.tower_template_revision_id).in("id", sectionIds)
      : { data: [], error: null };
    if (sectionsError) throw new Error(sectionsError.message);
    if (sections?.length !== sectionIds.length) liftInvalid("Each allocated section must belong to the Tower Template revision used by this Lift Template.");
    const normalizedAllocations = allocations.map((item) => ({ tower_template_section_id: String(item.tower_template_section_id), allocated_quantity: Number(item.allocated_quantity ?? 1), portion: Number(item.portion ?? 1) }));
    const sectionsWithIds = (sections ?? []) as TowerSectionInput[];
    const additionalMassKg = Number(lift.additionalMassKg ?? 0);
    const steelWeightKg = liftTemplateSteelWeightKg(normalizedAllocations, sectionsWithIds, additionalMassKg);
    const liftValues = {
      lift_template_revision_id: revisionId,
      lift_number: lift.liftNumber.trim(),
      name: lift.name.trim(),
      description: typeof lift.description === "string" ? lift.description.trim() : null,
      sequence_no: Number(lift.sequenceNo ?? 1),
      lift_type: typeof lift.liftType === "string" ? lift.liftType : "Erection",
      additional_mass_kg: additionalMassKg,
      erection_method: typeof lift.erectionMethod === "string" ? lift.erectionMethod.trim() : null,
      crane_suitability: lift.craneSuitability && typeof lift.craneSuitability === "object" ? lift.craneSuitability : {},
      notes: typeof lift.notes === "string" ? lift.notes : null,
    };
    if (!Number.isInteger(liftValues.sequence_no) || liftValues.sequence_no < 1) liftInvalid("Lift order must be a positive whole number.");
    const { data: created, error: createError } = await service.from("lift_erection_template_lifts").insert(liftValues).select("*").single();
    if (createError || !created) throw new Error(createError?.message || "Lift sequence row was not returned.");
    if (normalizedAllocations.length) {
      const { error } = await service.from("lift_erection_template_lift_sections").insert(normalizedAllocations.map((item) => ({ ...item, lift_template_lift_id: created.id })));
      if (error) { await service.from("lift_erection_template_lifts").delete().eq("id", created.id); throw new Error(error.message); }
    }
    return NextResponse.json({ ok: true, lift: { ...created, allocations: normalizedAllocations, steelWeightKg } }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const { liftTemplateId } = await context.params;
    const body = await request.json() as { liftId?: unknown };
    const liftId = typeof body.liftId === "string" ? body.liftId : "";
    if (!liftId) liftInvalid("Lift sequence row is required.");
    const { data: lift, error: liftError } = await service.from("lift_erection_template_lifts").select("id,lift_template_revision_id").eq("id", liftId).maybeSingle();
    if (liftError) throw new Error(liftError.message);
    if (!lift) return NextResponse.json({ error: "Lift sequence row was not found." }, { status: 404 });
    const { data: revision, error: revisionError } = await service.from("lift_erection_template_revisions").select("id,lift_template_id,status").eq("id", lift.lift_template_revision_id).maybeSingle();
    if (revisionError) throw new Error(revisionError.message);
    if (!revision || revision.lift_template_id !== liftTemplateId || revision.status !== "draft") liftInvalid("Only a Draft lift belonging to this Lift Template can be deleted.");
    const { count, error: useError } = await service.from("lift_study_lifts").select("id", { count: "exact", head: true }).eq("erection_template_lift_id", liftId);
    if (useError) throw new Error(useError.message);
    if ((count ?? 0) > 0) return NextResponse.json({ error: "This lift is referenced by a Lift Study and cannot be deleted from the template revision.", code: "lift_in_use" }, { status: 409 });
    const { error } = await service.from("lift_erection_template_lifts").delete().eq("id", liftId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, deletedId: liftId });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
