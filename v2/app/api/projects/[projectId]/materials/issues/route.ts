import { NextRequest, NextResponse } from "next/server";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireMaterialsContext, validateMaterialsRequest, materialsErrorResponse } from "@/lib/materials/security";
import { materialActorUserId } from "@/lib/materials/project-actor";

type Context = { params: Promise<{ projectId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { projectId } = await context.params;
    const body = await request.json();
    const project = await requireMaterialsContext(projectId, String(body.organisationId ?? "") || null, "manage_issues");
    const records = await validateMaterialsRequest(project, { ...body, currentTowerId: body.currentTowerId || body.towerId });
    const item=records.get("materialItemId");const bundle=records.get("bundleId");
    const registered=item??bundle;
    if(registered){
      if(body.towerId && registered.tower_id && body.towerId!==registered.tower_id) throw new Error("Material does not belong to the affected tower.");
      body.towerId=registered.tower_id??body.towerId;
      body.currentTowerId=body.towerId;
      body.itemReference=item?.item_reference??bundle?.bundle_reference??null;
      body.description=registered.description??registered.package_context??registered.segment??null;
      body.affectedSegment=registered.segment??null;
      body.unit=item?.unit??"ea";
      body.bundleId=item?.bundle_id??bundle?.id??null;
      await validateMaterialsRequest(project,body);
    }
    if(!body.towerId) throw new Error("Select an affected tower.");
    await validateMaterialsRequest(project,body);
    const admin = createSupabaseAdmin();
    const orgId = project.dataOrganisationId;
    const quantity=Number(body.quantity??1);
    if(!Number.isFinite(quantity)||quantity<=0)throw new Error("Issue quantity must be a positive number.");
    if(body.raisedAt && Number.isNaN(Date.parse(String(body.raisedAt))))throw new Error("Issue date/time is invalid.");
    if(!registered){
      const {data:option,error:optionError}=await admin.from("v2_project_option_definitions").select("settings")
        .eq("project_id",projectId).eq("option_group","material_issue_type").eq("option_key",String(body.issueTypeKey??"missing")).eq("is_active",true).maybeSingle();
      if(optionError)throw new Error(optionError.message);
      if(option?.settings?.allow_manual_material===false)throw new Error("Select a registered material for this issue type.");
    }


    const { data: issueNumber, error: numberError } = await admin.rpc("tttracker_v2_next_material_issue_number", { p_project_id: projectId });
    if (numberError) throw new Error(numberError.message);

    const { data: issue, error } = await admin.from("v2_material_issues").insert({
      organisation_id: orgId,
      project_id: projectId,
      issue_number: issueNumber,
      tower_id: body.towerId || null,
      material_item_id: body.materialItemId || null,
      bundle_id: body.bundleId || null,
      issue_type_key: String(body.issueTypeKey ?? "missing"),
      item_reference: body.itemReference || null,
      description: body.description || null,
      quantity_affected: quantity,
      unit: String(body.unit ?? "ea"),
      raised_docket_id: body.docketId || null,
      raised_at: body.raisedAt || new Date().toISOString(),
      raised_by: materialActorUserId(project),
      affected_work: Boolean(body.affectedWork),
      work_outcome_key: body.workOutcomeKey || null,
      affected_activity: body.affectedActivity || null,
      affected_segment: body.affectedSegment || null,
      current_effect: body.currentEffect || null,
      current_location_id: body.currentLocationId || null,
      current_tower_id: body.currentTowerId || body.towerId || null,
      origin_organisation_id: orgId,
      visibility_scope: "origin_only",
      metadata: registered ? { material_kind: item?.material_kind ?? "bundle", drawing_reference: item?.drawing_reference ?? null,
        profile: item?.profile ?? null, expected_quantity: registered.required_quantity ?? null,
        bundle_reference: item?.bundle_reference ?? bundle?.bundle_reference ?? null } : {},
    }).select("id,issue_number").single();
    if (error) throw new Error(error.message);

    const { error: eventError } = await admin.from("v2_material_issue_events").insert({
      organisation_id: orgId,
      project_id: projectId,
      issue_id: issue.id,
      event_type_key: "raised",
      quantity: 0,
      unit: String(body.unit ?? "ea"),
      docket_id: body.docketId || null,
      notes: body.notes || null,
      occurred_at: body.raisedAt || new Date().toISOString(),
      created_by: materialActorUserId(project),
    });
    if (eventError) throw new Error(eventError.message);
    return NextResponse.json({ ok: true, issue });
  } catch (error) {
    return materialsErrorResponse(error);
  }
}
