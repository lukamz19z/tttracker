import { NextRequest, NextResponse } from "next/server";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (value: unknown) => String(value ?? "").trim();

/** Lightweight reconciliation for a client whose report POST response was lost. */
export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobilePermission(request, "mobile.materials");
    const projectId = clean(request.nextUrl.searchParams.get("projectId"));
    const towerId = clean(request.nextUrl.searchParams.get("towerId"));
    const clientMutationId = clean(request.nextUrl.searchParams.get("clientMutationId"));
    if (!projectId || !towerId || !clientMutationId) {
      return NextResponse.json({ error: "Project, tower and mutation ID are required." }, { status: 400 });
    }

    const { data: access, error: accessError } = await service.from("project_access")
      .select("project_id").eq("project_id", projectId).eq("user_id", identity.userId).maybeSingle();
    if (accessError) throw new Error(accessError.message);
    if (!access) return NextResponse.json({ error: "You do not have access to this project." }, { status: 403 });

    const { data: event, error } = await service.from("tower_material_events")
      .select("id,project_id,tower_id,event_type,issue_status,assigned_to_user_id,notify_user_ids,client_mutation_id,tower_material_event_items(issue_key)")
      .eq("project_id", projectId).eq("tower_id", towerId).eq("client_mutation_id", clientMutationId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!event) return NextResponse.json({ found: false }, { status: 404 });

    return NextResponse.json({ found: true, event });
  } catch (error) {
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
