import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

export async function GET(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const arrangementId = new URL(request.url).searchParams.get("arrangementId")?.trim(); if (!arrangementId) liftInvalid("Rigging arrangement is required.");
    const { data, error } = await service.from("lift_rigging_arrangement_items").select("id,arrangement_id,rigging_item_revision_id,quantity,mass_override_kg,override_reason,lift_rigging_item_revisions(revision,mass_kg,wll_t,lift_rigging_items(description,category))").eq("arrangement_id", arrangementId);
    if (error) throw new Error(error.message);
    const items = (data ?? []).map((row) => {
      const relation = row.lift_rigging_item_revisions as unknown as { mass_kg?: number } | { mass_kg?: number }[] | null;
      const revisionMass = relation ? Array.isArray(relation) ? relation[0]?.mass_kg : (relation as { mass_kg?: number }).mass_kg : 0;
      return { ...row, derivedMassKg: Number(row.quantity) * Number(row.mass_override_kg ?? revisionMass ?? 0) };
    });
    return NextResponse.json({ items, totalTareKg: items.reduce((sum, item) => sum + item.derivedMassKg, 0) });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const body = await request.json() as Record<string, unknown>;
    const arrangementId = typeof body.arrangementId === "string" ? body.arrangementId.trim() : "";
    const revisionId = typeof body.riggingItemRevisionId === "string" ? body.riggingItemRevisionId.trim() : "";
    const quantity = Number(body.quantity); const overrideValue = body.massOverrideKg == null || body.massOverrideKg === "" ? null : Number(body.massOverrideKg);
    const overrideReason = typeof body.overrideReason === "string" ? body.overrideReason.trim() : "";
    if (!arrangementId || !revisionId || !Number.isFinite(quantity) || quantity <= 0) liftInvalid("Arrangement, rigging revision and positive quantity are required.");
    if (overrideValue !== null && (!Number.isFinite(overrideValue) || overrideValue < 0 || !overrideReason)) liftInvalid("An arrangement-specific mass override requires a non-negative mass and justification.");
    const [{ data: arrangement, error: arrangementError }, { data: revision, error: revisionError }] = await Promise.all([
      service.from("lift_rigging_arrangements").select("id").eq("id", arrangementId).maybeSingle(),
      service.from("lift_rigging_item_revisions").select("id").eq("id", revisionId).maybeSingle(),
    ]);
    if (arrangementError || revisionError) throw new Error(arrangementError?.message || revisionError?.message);
    if (!arrangement || !revision) liftInvalid("Selected arrangement or rigging item revision was not found.");
    const { data, error } = await service.from("lift_rigging_arrangement_items").insert({ arrangement_id: arrangementId, rigging_item_revision_id: revisionId, quantity, mass_override_kg: overrideValue, override_reason: overrideReason || null }).select("id,arrangement_id,rigging_item_revision_id,quantity,mass_override_kg,override_reason").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
