import { NextRequest, NextResponse } from "next/server";
import { assertMobileProjectAccess, qualityClean, qualityRouteError } from "@/lib/mobile/quality";
import { requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
type Context = { params: Promise<{ revisionId: string }> };
type Body = { inspectionStage?: string; inspectionDate?: string; clientInspector?: string | null; clientCompany?: string | null; clientReference?: string | null; notes?: string | null; status?: string };
export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { revisionId } = await context.params; const { service, identity } = await requireMobilePermission(request, "mobile.rectifications");
    const { data: current, error: currentError } = await service.from("tower_revisions").select("*").eq("id", revisionId).maybeSingle(); if (currentError) throw new Error(currentError.message); if (!current) return NextResponse.json({ error: "Revision not found." }, { status: 404 });
    await assertMobileProjectAccess(service, identity.userId, current.project_id); const body = (await request.json()) as Body; const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.inspectionStage !== undefined) patch.inspection_stage = qualityClean(body.inspectionStage); if (body.inspectionDate !== undefined) patch.inspection_date = qualityClean(body.inspectionDate); if (body.clientInspector !== undefined) patch.client_inspector = qualityClean(body.clientInspector) || null; if (body.clientCompany !== undefined) patch.client_company = qualityClean(body.clientCompany) || null; if (body.clientReference !== undefined) patch.client_reference = qualityClean(body.clientReference) || null; if (body.notes !== undefined) patch.notes = qualityClean(body.notes) || null; if (body.status !== undefined) { patch.status = qualityClean(body.status); if (body.status === "Closed") { patch.completed_by = identity.userId; patch.completed_by_label = identity.fullName; patch.completed_at = new Date().toISOString(); } else { patch.completed_by = null; patch.completed_by_label = null; patch.completed_at = null; } }
    const { data, error } = await service.from("tower_revisions").update(patch).eq("id", revisionId).select("*").single(); if (error || !data) throw new Error(error?.message || "Revision could not be updated."); return NextResponse.json({ revision: data });
  } catch (error) { const apiError = qualityRouteError(error); return NextResponse.json({ error: apiError.message }, { status: apiError.status }); }
}
