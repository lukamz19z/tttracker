import { NextRequest, NextResponse } from "next/server";

import { assertMobileProjectAccess, assertMobileTower, qualityClean, qualityRouteError } from "@/lib/mobile/quality";
import { requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { clientMutationId?: string; projectId?: string; towerId?: string; inspectionStage?: string; inspectionDate?: string; clientInspector?: string | null; clientCompany?: string | null; clientReference?: string | null; notes?: string | null };

export async function POST(request: NextRequest) {
  try {
    const { service, user, identity } = await requireMobilePermission(request, "mobile.rectifications");
    const body = (await request.json()) as Body;
    const clientMutationId = qualityClean(body.clientMutationId); const projectId = qualityClean(body.projectId); const towerId = qualityClean(body.towerId);
    if (!clientMutationId || !projectId || !towerId) return NextResponse.json({ error: "Client mutation ID, project and tower are required." }, { status: 400 });
    await assertMobileProjectAccess(service, identity.userId, projectId); await assertMobileTower(service, projectId, towerId);
    const { data: existing, error: existingError } = await service.from("tower_revisions").select("*").eq("project_id", projectId).eq("mobile_client_mutation_id", clientMutationId).maybeSingle();
    if (existingError) throw new Error(existingError.message); if (existing) return NextResponse.json({ revision: existing, duplicate: true });
    const { data, error } = await service.from("tower_revisions").insert({ project_id: projectId, tower_id: towerId, inspection_stage: qualityClean(body.inspectionStage) || "Post Assembly", inspection_date: qualityClean(body.inspectionDate) || new Date().toISOString().slice(0, 10), client_inspector: qualityClean(body.clientInspector) || null, client_company: qualityClean(body.clientCompany) || null, client_reference: qualityClean(body.clientReference) || null, notes: qualityClean(body.notes) || null, status: "Draft", created_by: user.id, created_by_label: identity.fullName, mobile_client_mutation_id: clientMutationId }).select("*").single();
    if (error || !data) { const { data: recovered } = await service.from("tower_revisions").select("*").eq("project_id", projectId).eq("mobile_client_mutation_id", clientMutationId).maybeSingle(); if (recovered) return NextResponse.json({ revision: recovered, duplicate: true }); throw new Error(error?.message || "Revision could not be saved."); }
    return NextResponse.json({ revision: data });
  } catch (error) { const apiError = qualityRouteError(error); return NextResponse.json({ error: apiError.message }, { status: apiError.status }); }
}
