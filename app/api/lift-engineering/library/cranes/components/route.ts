import { NextResponse } from "next/server";
import { LIFT_ACCESS, liftApiError, liftInvalid, requireLiftAccess } from "@/lib/lift-engineering/server";

export async function GET(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.view);
    const revisionId = new URL(request.url).searchParams.get("craneProfileRevisionId")?.trim(); if (!revisionId) liftInvalid("Crane profile revision is required.");
    const [hooks, ropes, attachments, supports] = await Promise.all([
      service.from("lift_crane_hooks").select("*").eq("crane_profile_revision_id", revisionId),
      service.from("lift_crane_ropes").select("*").eq("crane_profile_revision_id", revisionId),
      service.from("lift_crane_attachments").select("*").eq("crane_profile_revision_id", revisionId),
      service.from("lift_crane_outriggers").select("*").eq("crane_profile_revision_id", revisionId).order("support_key"),
    ]);
    for (const result of [hooks, ropes, attachments, supports]) if (result.error) throw new Error(result.error.message);
    return NextResponse.json({ hooks: hooks.data ?? [], ropes: ropes.data ?? [], attachments: attachments.data ?? [], supports: supports.data ?? [] });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}

export async function POST(request: Request) {
  try {
    const { service } = await requireLiftAccess(request, LIFT_ACCESS.manageLibrary);
    const body = await request.json() as Record<string, unknown>;
    const revisionId = typeof body.craneProfileRevisionId === "string" ? body.craneProfileRevisionId.trim() : "";
    const type = String(body.type ?? ""); const name = String(body.name ?? "").trim();
    if (!revisionId) liftInvalid("Crane profile revision is required.");
    const { data: revision, error: revError } = await service.from("lift_crane_profile_revisions").select("id").eq("id", revisionId).maybeSingle();
    if (revError) throw new Error(revError.message); if (!revision) liftInvalid("Crane profile revision was not found.");
    let table: string; let values: Record<string, unknown>;
    if (["hook","rope","attachment"].includes(type)) {
      const massKg = Number(body.massKg); if (!name || !Number.isFinite(massKg) || massKg < 0) liftInvalid("Component name and non-negative mass are required.");
      table = type === "hook" ? "lift_crane_hooks" : type === "rope" ? "lift_crane_ropes" : "lift_crane_attachments";
      values = { crane_profile_revision_id: revisionId, name, mass_kg: massKg,
        ...(type === "hook" ? { hook_type: body.category ?? null } : type === "rope" ? { rope_type: body.category ?? null } : { x_m: body.xM ?? null, y_m: body.yM ?? null }) };
    } else if (type === "support") {
      const supportKey = String(body.supportKey ?? ""); const xM = Number(body.xM); const yM = Number(body.yM);
      if (!(["OR1","OR2","OR3","OR4","SLEW_CENTRE"].includes(supportKey)) || !Number.isFinite(xM) || !Number.isFinite(yM)) liftInvalid("Support requires OR1–OR4 or SLEW_CENTRE and finite x/y coordinates.");
      table = "lift_crane_outriggers"; values = { crane_profile_revision_id: revisionId, support_key: supportKey, x_m: xM, y_m: yM };
    } else liftInvalid("Crane component type is not supported.");
    const { data, error } = await service.from(table).insert(values).select("*").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ component: data }, { status: 201 });
  } catch (error) { const result = liftApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
