import { revisionEvidenceContext } from "@/lib/quality/evidence-context";
import { revisionItemFli, revisionReference } from "@/lib/quality/fli";
import { NextRequest, NextResponse } from "next/server";
import { assertMobileProjectAccess, qualityClean, qualityRouteError } from "@/lib/mobile/quality";
import { requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Context = { params: Promise<{ revisionId: string; itemId: string }> };
type Body = { leg?: string | null; assignedFlag?: string | null; issueTypeId?: string | null; otherIssueText?: string | null; towerSegment?: string | null; memberNumber?: string | null; drawingNumber?: string | null; finding?: string | null; rectificationComment?: string | null; status?: string };
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { revisionId, itemId } = await context.params; const { service, identity } = await requireMobilePermission(request, "mobile.rectifications"); const { data: current, error: currentError } = await service.from("tower_revision_items").select("*").eq("id", itemId).eq("revision_id", revisionId).maybeSingle(); if (currentError) throw new Error(currentError.message); if (!current) return NextResponse.json({ error: "Finding not found." }, { status: 404 }); await assertMobileProjectAccess(service, identity.userId, current.project_id); const body = (await request.json()) as Body; const patch: Record<string, unknown> = {};
    if (body.leg !== undefined) { const leg = qualityClean(body.leg); if (leg && !["A","B","C","D"].includes(leg)) return NextResponse.json({ error: "Invalid Leg." }, { status: 400 }); patch.leg = leg || null; }
    if (body.assignedFlag !== undefined) patch.assigned_flag = qualityClean(body.assignedFlag) || null;
    if (body.status === "Rectified") {
      const evidence = await service.from("tower_quality_files").select("file_role").eq("revision_item_id", itemId).in("file_role", ["before_photo","after_photo"]);
      if (evidence.error) throw new Error(evidence.error.message);
      if (!["before_photo","after_photo"].every(role => evidence.data?.some(row => row.file_role === role))) return NextResponse.json({ error: "Before and After evidence must sync before marking Rectified." }, { status: 409 });
    }
    if (body.issueTypeId !== undefined) patch.issue_type_id = qualityClean(body.issueTypeId) || null; if (body.otherIssueText !== undefined) patch.other_issue_text = qualityClean(body.otherIssueText) || null; if (body.towerSegment !== undefined) patch.tower_segment = qualityClean(body.towerSegment) || null; if (body.memberNumber !== undefined) patch.member_number = qualityClean(body.memberNumber) || null; if (body.drawingNumber !== undefined) patch.drawing_number = qualityClean(body.drawingNumber) || null; if (body.finding !== undefined) patch.finding = qualityClean(body.finding) || null; if (body.rectificationComment !== undefined) patch.rectification_comment = qualityClean(body.rectificationComment) || null; if (body.status !== undefined) patch.status = qualityClean(body.status);
    const { data, error } = await service.from("tower_revision_items").update(patch).eq("id", itemId).eq("revision_id", revisionId).select("*").single(); if (error || !data) throw new Error(error?.message || "Finding could not be updated."); const invalidated = await service.from("tower_revisions").update({ finalised_at: null }).eq("id", revisionId); if (invalidated.error) throw new Error(invalidated.error.message); return NextResponse.json({ item: data });
  } catch (error) { const apiError = qualityRouteError(error); return NextResponse.json({ error: apiError.message }, { status: apiError.status }); }
}

export async function GET(request: NextRequest, context: Context) {
  try {
    const { revisionId,itemId } = await context.params;
    const { service,identity } = await requireMobilePermission(request,"mobile.rectifications");
    const current = await service.from("tower_revision_items").select("*").eq("id",itemId).eq("revision_id",revisionId).maybeSingle();
    if (current.error) throw new Error(current.error.message);
    if (!current.data) return NextResponse.json({error:"Finding not found."},{status:404});
    const item=current.data;
    await assertMobileProjectAccess(service,identity.userId,item.project_id);
    const [parent,tower,issue] = await Promise.all([
      service.from("tower_revisions").select("revision_number,fli_number,sequence_no").eq("id",revisionId).eq("project_id",item.project_id).single(),
      service.from("towers").select("name").eq("id",item.tower_id).eq("project_id",item.project_id).single(),
      item.issue_type_id ? service.from("project_field_issue_types").select("name").eq("id",item.issue_type_id).maybeSingle() : Promise.resolve({data:null,error:null}),
    ]);
    for(const result of [parent,tower,issue]) if(result.error) throw new Error(result.error.message);
    if (!parent.data || !tower.data) return NextResponse.json({error:"Revision or tower not found."},{status:404});
    const reference=revisionReference(parent.data),fli=revisionItemFli(item);
    if(!reference || !fli) return NextResponse.json({error:"Finding identifiers are not ready."},{status:409});
    return NextResponse.json({ item, evidenceContext:revisionEvidenceContext(parent.data,item,tower.data.name,issue.data?.name) });
  }catch(error){ const result=qualityRouteError(error);return NextResponse.json({error:result.message},{status:result.status}); }
}
