import { NextResponse } from "next/server";
import { externalReferencePadPressure } from "@/lib/lift-engineering/calculations/verification";
import { assertLiftProjectAccess, liftApiError, liftInvalid, requireLiftAccess, LIFT_ACCESS } from "@/lib/lift-engineering/server";

export async function POST(request: Request, context: { params: Promise<{ studyId: string }> }) {
  try {
    const { user, service } = await requireLiftAccess(request, LIFT_ACCESS.editStudy);
    const { studyId } = await context.params; const body = await request.json() as Record<string, unknown>;
    const { data: study, error } = await service.from("lift_studies").select("id,project_id,current_revision_id").eq("id", studyId).maybeSingle();
    if (error) throw new Error(error.message); if (!study) return NextResponse.json({ error: "Lift Study was not found." }, { status: 404 });
    await assertLiftProjectAccess(service, user.id, study.project_id);
    const { data: revision, error: revError } = await service.from("lift_study_revisions").select("id,status,issued_at,calculation_inputs").eq("id", study.current_revision_id).maybeSingle();
    if (revError) throw new Error(revError.message); if (!revision || revision.status !== "draft" || revision.issued_at) liftInvalid("External reference reactions can only be added to a draft study revision.");
    const support = typeof body.support === "string" ? body.support.trim() : "";
    if (!/^OR[1-4]$/.test(support)) liftInvalid("Support must be OR1, OR2, OR3 or OR4.");
    const sourceReference = typeof body.reference === "string" ? body.reference.trim() : "";
    const settings = revision.calculation_inputs && typeof revision.calculation_inputs === "object" ? (revision.calculation_inputs as Record<string, unknown>).studySettings as Record<string, unknown> | undefined : undefined;
    const padWidthM = Number(settings?.padWidthM); const padLengthM = Number(settings?.padLengthM);
    if (!Number.isFinite(padWidthM) || !Number.isFinite(padLengthM) || padWidthM <= 0 || padLengthM <= 0) liftInvalid("Save pad dimensions in Study Setup before adding reference reactions.");
    const result = externalReferencePadPressure({ support, reactionKn: Number(body.reactionKn), reference: sourceReference }, padWidthM, padLengthM);
    const allowableKpa = Number(settings?.allowableGroundPressureKpa);
    const pressureWarning = Number.isFinite(allowableKpa) && allowableKpa > 0 && result.pressureKpa > allowableKpa ? [`Reference pad pressure exceeds the stored allowable value of ${allowableKpa} kPa.`] : [];
    const { data, error: insertError } = await service.from("lift_study_outrigger_results").insert({
      study_revision_id: revision.id, origin: "external_reference", support_key: support,
      reaction_kn: result.reactionKn, pad_area_m2: padWidthM * padLengthM,
      pressure_kpa: result.pressureKpa, source_reference: { reference: sourceReference, warnings: [...result.warnings, ...pressureWarning],
        padWidthM, padLengthM, allowableGroundPressureKpa: allowableKpa || null },
      method_version: "external-reference-v1", independently_verified: false,
    }).select("id,origin,support_key,reaction_kn,pad_area_m2,pressure_kpa,source_reference,method_version,independently_verified").single();
    if (insertError) throw new Error(insertError.message);
    return NextResponse.json({ result: data }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
