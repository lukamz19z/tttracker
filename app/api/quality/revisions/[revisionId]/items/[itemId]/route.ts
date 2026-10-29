import { NextResponse } from "next/server";
import { qualityWorkflowAccess } from "@/lib/quality/workflow-access";
import { qualityApiError, assertQualityProjectAccess } from "@/lib/quality/server";
import { atomicQualityError } from "@/lib/quality/atomic-error";

export async function PATCH(request: Request, context: { params: Promise<{ revisionId: string; itemId: string }> }) {
  try {
    const { service, user, role, label } = await qualityWorkflowAccess(request);
    const { revisionId, itemId } = await context.params;
    const item = await service.from("tower_revision_items").select("project_id").eq("id", itemId).eq("revision_id", revisionId).maybeSingle();
    if (item.error) throw new Error(item.error.message);
    if (!item.data) return NextResponse.json({ error: "Finding not found." }, { status: 404 });
    await assertQualityProjectAccess({ service, userId: user.id, role, projectId: item.data.project_id });
    const body = await request.json();
    const mapping: Record<string, string> = { leg: "leg", assignedFlag: "assigned_flag", issueTypeId: "issue_type_id", otherIssueText: "other_issue_text", towerSegment: "tower_segment", memberNumber: "member_number", drawingNumber: "drawing_number", finding: "finding", rectificationComment: "rectification_comment", status: "status" };
    const patch: Record<string, string | null> = {};
    for (const [key, column] of Object.entries(mapping)) if (Object.hasOwn(body, key)) {
      if (body[key] !== null && (typeof body[key] !== "string" || body[key].length > 10000)) return NextResponse.json({ error: `Invalid ${key}.` }, { status: 400 });
      patch[column] = body[key]?.trim() || null;
    }
    if (patch.leg && !["A", "B", "C", "D"].includes(patch.leg)) return NextResponse.json({ error: "Choose Leg A, B, C or D." }, { status: 400 });
    if (!Number.isSafeInteger(body.expectedVersion) || !body.clientMutationId) return NextResponse.json({ error: "Refresh this FLI before saving; its version and edit request ID are required.", code: "RECONCILIATION_REQUIRED" }, { status: 409 });
    const result = await service.rpc("update_v1_quality_item", { p_item: itemId, p_actor: user.id, p_version: body.expectedVersion, p_mutation: body.clientMutationId, p_patch: patch, p_label: label });
    if (result.error) { const error = atomicQualityError(result.error); return NextResponse.json({ error: error.message, code: error.status === 409 ? "RECONCILIATION_REQUIRED" : undefined }, { status: error.status }); }
    return NextResponse.json({ item: result.data });
  } catch (error) { const result = qualityApiError(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
}
