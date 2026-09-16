import { NextRequest, NextResponse } from "next/server";
import { assertMobileProjectAccess, qualityClean, qualityRouteError } from "@/lib/mobile/quality";
import { requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Context = { params: Promise<{ revisionId: string; itemId: string }> };
type Body = { issueTypeId?: string | null; otherIssueText?: string | null; towerSegment?: string | null; memberNumber?: string | null; drawingNumber?: string | null; finding?: string | null; rectificationComment?: string | null; status?: string };
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { revisionId, itemId } = await context.params; const { service, identity } = await requireMobilePermission(request, "mobile.rectifications"); const { data: current, error: currentError } = await service.from("tower_revision_items").select("*").eq("id", itemId).eq("revision_id", revisionId).maybeSingle(); if (currentError) throw new Error(currentError.message); if (!current) return NextResponse.json({ error: "Finding not found." }, { status: 404 }); await assertMobileProjectAccess(service, identity.userId, current.project_id); const body = (await request.json()) as Body; const patch: Record<string, unknown> = {};
    if (body.issueTypeId !== undefined) patch.issue_type_id = qualityClean(body.issueTypeId) || null; if (body.otherIssueText !== undefined) patch.other_issue_text = qualityClean(body.otherIssueText) || null; if (body.towerSegment !== undefined) patch.tower_segment = qualityClean(body.towerSegment) || null; if (body.memberNumber !== undefined) patch.member_number = qualityClean(body.memberNumber) || null; if (body.drawingNumber !== undefined) patch.drawing_number = qualityClean(body.drawingNumber) || null; if (body.finding !== undefined) patch.finding = qualityClean(body.finding) || null; if (body.rectificationComment !== undefined) patch.rectification_comment = qualityClean(body.rectificationComment) || null; if (body.status !== undefined) patch.status = qualityClean(body.status);
    const { data, error } = await service.from("tower_revision_items").update(patch).eq("id", itemId).eq("revision_id", revisionId).select("*").single(); if (error || !data) throw new Error(error?.message || "Finding could not be updated."); return NextResponse.json({ item: data });
  } catch (error) { const apiError = qualityRouteError(error); return NextResponse.json({ error: apiError.message }, { status: apiError.status }); }
}
