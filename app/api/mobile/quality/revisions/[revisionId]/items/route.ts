import { NextRequest, NextResponse } from "next/server";
import { assertMobileProjectAccess, qualityClean, qualityRouteError } from "@/lib/mobile/quality";
import { requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Context = { params: Promise<{ revisionId: string }> };
type Body = { clientMutationId?: string; projectId?: string; towerId?: string; issueTypeId?: string | null; otherIssueText?: string | null; towerSegment?: string | null; memberNumber?: string | null; drawingNumber?: string | null; finding?: string; rectificationComment?: string | null; status?: string };
export async function POST(request: NextRequest, context: Context) {
  try {
    const { revisionId } = await context.params; const { service, user, identity } = await requireMobilePermission(request, "mobile.rectifications"); const body = (await request.json()) as Body; const clientMutationId = qualityClean(body.clientMutationId);
    const { data: revision, error: revisionError } = await service.from("tower_revisions").select("id,project_id,tower_id,status").eq("id", revisionId).maybeSingle(); if (revisionError) throw new Error(revisionError.message); if (!revision) return NextResponse.json({ error: "Revision not found." }, { status: 404 }); await assertMobileProjectAccess(service, identity.userId, revision.project_id);
    if (!clientMutationId) return NextResponse.json({ error: "Client mutation ID is required." }, { status: 400 }); const finding = qualityClean(body.finding); if (!finding) return NextResponse.json({ error: "Enter the finding details." }, { status: 400 });
    const { data: existing, error: existingError } = await service.from("tower_revision_items").select("*").eq("project_id", revision.project_id).eq("mobile_client_mutation_id", clientMutationId).maybeSingle(); if (existingError) throw new Error(existingError.message); if (existing) return NextResponse.json({ item: existing, duplicate: true });
    const { data, error } = await service.from("tower_revision_items").insert({ revision_id: revision.id, project_id: revision.project_id, tower_id: revision.tower_id, issue_type_id: qualityClean(body.issueTypeId) || null, other_issue_text: qualityClean(body.otherIssueText) || null, tower_segment: qualityClean(body.towerSegment) || null, member_number: qualityClean(body.memberNumber) || null, drawing_number: qualityClean(body.drawingNumber) || null, finding, rectification_comment: qualityClean(body.rectificationComment) || null, status: qualityClean(body.status) || "Open", created_by: user.id, mobile_client_mutation_id: clientMutationId }).select("*").single();
    if (error || !data) { const { data: recovered } = await service.from("tower_revision_items").select("*").eq("project_id", revision.project_id).eq("mobile_client_mutation_id", clientMutationId).maybeSingle(); if (recovered) return NextResponse.json({ item: recovered, duplicate: true }); throw new Error(error?.message || "Finding could not be saved."); }
    if (revision.status === "Draft") await service.from("tower_revisions").update({ status: "In Progress" }).eq("id", revision.id).eq("status", "Draft");
    return NextResponse.json({ item: data });
  } catch (error) { const apiError = qualityRouteError(error); return NextResponse.json({ error: apiError.message }, { status: apiError.status }); }
}
