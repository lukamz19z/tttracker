import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

export async function GET(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const revisionId = new URL(request.url).searchParams.get("templateRevisionId")?.trim(); if (!revisionId) liftInvalid("Template revision is required.");
    const { data: lifts, error } = await service.from("lift_template_lifts").select("*").eq("template_revision_id", revisionId).order("sequence_no");
    if (error) throw new Error(error.message);
    const ids = (lifts ?? []).map((lift) => lift.id);
    const [elements, phases] = await Promise.all([
      service.from("lift_template_lift_elements").select("*").in("template_lift_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).order("sequence_no"),
      service.from("lift_template_lift_phases").select("*").in("template_lift_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).order("sequence_no"),
    ]);
    if (elements.error || phases.error) throw new Error(elements.error?.message || phases.error?.message);
    return NextResponse.json({ lifts: (lifts ?? []).map((lift) => ({ ...lift,
      elements: (elements.data ?? []).filter((element) => element.template_lift_id === lift.id),
      phases: (phases.data ?? []).filter((phase) => phase.template_lift_id === lift.id),
    })) });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const body = await request.json() as Record<string, unknown>;
    const templateRevisionId = typeof body.templateRevisionId === "string" ? body.templateRevisionId.trim() : "";
    const lift = body.lift && typeof body.lift === "object" ? body.lift as Record<string, unknown> : {};
    const liftNumber = typeof lift.liftNumber === "string" ? lift.liftNumber.trim() : "";
    const sequenceNo = Number(lift.sequenceNo);
    if (!templateRevisionId || !liftNumber || !Number.isInteger(sequenceNo) || sequenceNo < 1) liftInvalid("Template revision, lift number and positive sequence are required.");
    const { data: revision, error: revError } = await service.from("lift_tower_template_revisions").select("id,status").eq("id", templateRevisionId).maybeSingle();
    if (revError) throw new Error(revError.message); if (!revision) liftInvalid("Template revision was not found.");
    if (revision.status !== "draft") liftInvalid("Only draft tower template revisions can be changed.");
    const { data: row, error } = await service.from("lift_template_lifts").insert({
      template_revision_id: templateRevisionId, lift_number: liftNumber, sequence_no: sequenceNo,
      description: String(lift.description ?? liftNumber), lift_type: String(lift.liftType ?? "Custom"),
      dimensions: lift.dimensions ?? {}, installed_height_m: lift.installedHeightM ?? null,
      boom_configuration: lift.boomConfiguration ?? null, boom_length_m: lift.boomLengthM ?? null,
      boom_sequence: lift.boomSequence ?? null, default_radius_m: lift.defaultRadiusM ?? null,
      maximum_radius_m: lift.maximumRadiusM ?? null, effective_load_factor: lift.effectiveLoadFactor ?? 1,
      default_rigging_arrangement_id: lift.defaultRiggingArrangementId ?? null, hook_nomination: lift.hookNomination ?? null,
      notes: lift.notes ?? null, drawing_references: lift.drawingReferences ?? [],
    }).select("id,lift_number,sequence_no").single();
    if (error || !row) throw new Error(error?.message || "Template lift was not returned.");
    const elements = Array.isArray(lift.elements) ? lift.elements as Array<Record<string, unknown>> : [];
    const phases = Array.isArray(lift.phases) ? lift.phases as Array<Record<string, unknown>> : [];
    const elementRows = elements.map((item, index) => ({ template_lift_id: row.id, description: String(item.description ?? "").trim(), mass_kg: Number(item.massKg), dimensions: item.dimensions ?? {}, sequence_no: Number(item.sequenceNo ?? index + 1) }));
    const phaseRows = phases.map((phase, index) => ({ template_lift_id: row.id, phase_key: String(phase.key ?? `phase-${index + 1}`), phase_name: String(phase.name ?? `Phase ${index + 1}`), main_load_share: Number(phase.mainLoadShare ?? 1), auxiliary_load_share: Number(phase.auxiliaryLoadShare ?? 0), radius_m: phase.radiusM ?? null, notes: phase.notes ?? null, sequence_no: Number(phase.sequenceNo ?? index + 1) }));
    if (elementRows.some((item) => !item.description || !Number.isFinite(item.mass_kg) || item.mass_kg < 0) || phaseRows.some((item) => !Number.isFinite(item.main_load_share) || item.main_load_share < 0 || !Number.isFinite(item.auxiliary_load_share) || item.auxiliary_load_share < 0)) {
      await service.from("lift_template_lifts").delete().eq("id", row.id); liftInvalid("Template lift elements or phases contain invalid values.");
    }
    const [elementResult, phaseResult] = await Promise.all([
      elementRows.length ? service.from("lift_template_lift_elements").insert(elementRows) : Promise.resolve({ error: null }),
      phaseRows.length ? service.from("lift_template_lift_phases").insert(phaseRows) : Promise.resolve({ error: null }),
    ]);
    if (elementResult.error || phaseResult.error) {
      await service.from("lift_template_lifts").delete().eq("id", row.id);
      throw new Error(`Template lift save failed: ${elementResult.error?.message || phaseResult.error?.message}`);
    }
    return NextResponse.json({ lift: row }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
