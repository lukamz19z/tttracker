import { NextRequest, NextResponse } from "next/server";

import { assertMobileProjectAccess, assertMobileTower, qualityClean, qualityRouteError } from "@/lib/mobile/quality";
import { requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  clientMutationId?: string;
  projectId?: string;
  towerId?: string;
  issueTypeId?: string | null;
  memberNumber?: string | null;
  segment?: string | null;
  drawingNumber?: string | null;
  description?: string;
  responsibility?: string | null;
  clientReference?: string | null;
  severity?: "Minor" | "Major" | "Critical";
  assignedToUserId?: string | null;
};

export async function POST(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.defects");
    const body = (await request.json()) as Body;
    const clientMutationId = qualityClean(body.clientMutationId);
    const projectId = qualityClean(body.projectId);
    const towerId = qualityClean(body.towerId);
    const description = qualityClean(body.description);
    if (!clientMutationId) return NextResponse.json({ error: "Client mutation ID is required." }, { status: 400 });
    if (!projectId || !towerId) return NextResponse.json({ error: "Project and tower are required." }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Enter a Defect description." }, { status: 400 });
    await assertMobileProjectAccess(service, identity.userId, projectId);
    await assertMobileTower(service, projectId, towerId);

    const { data: existing, error: existingError } = await service
      .from("tower_defects")
      .select("*")
      .eq("project_id", projectId)
      .eq("mobile_client_mutation_id", clientMutationId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (existing) return NextResponse.json({ defect: existing, duplicate: true });

    const auth = request.headers.get("authorization") || "";
    const response = await fetch(new URL("/api/quality/defects", request.url), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify({
        projectId, towerId,
        issueTypeId: qualityClean(body.issueTypeId) || null,
        memberNumber: qualityClean(body.memberNumber) || null,
        segment: qualityClean(body.segment) || null,
        drawingNumber: qualityClean(body.drawingNumber) || null,
        description,
        responsibility: qualityClean(body.responsibility) || null,
        clientReference: qualityClean(body.clientReference) || null,
        severity: body.severity || "Minor",
        assignedToUserId: qualityClean(body.assignedToUserId) || null,
        source: `mobile:${clientMutationId}`,
      }),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => null)) as { defect?: Record<string, unknown>; warning?: string | null; error?: string } | null;
    if (!response.ok || !payload?.defect) {
      const { data: recovered } = await service.from("tower_defects").select("*").eq("project_id", projectId).eq("mobile_client_mutation_id", clientMutationId).maybeSingle();
      if (recovered) return NextResponse.json({ defect: recovered, duplicate: true });
      return NextResponse.json({ error: payload?.error || "Defect could not be saved." }, { status: response.status || 500 });
    }
    return NextResponse.json(payload);
  } catch (error) {
    const apiError = qualityRouteError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
