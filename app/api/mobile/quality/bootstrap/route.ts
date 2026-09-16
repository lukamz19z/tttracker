import { NextRequest, NextResponse } from "next/server";

import { userHasAccess } from "@/lib/access/server";
import { assertMobileProjectAccess } from "@/lib/mobile/quality";
import { mobileApiError, requireMobileUser } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobileUser(request);
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || "";
    if (!projectId) return NextResponse.json({ error: "Project ID is required." }, { status: 400 });

    const [canRevision, canDefect] = await Promise.all([
      userHasAccess(service, identity.userId, "mobile.rectifications"),
      userHasAccess(service, identity.userId, "mobile.defects"),
    ]);
    if (!canRevision && !canDefect) return NextResponse.json({ error: "You do not have mobile Quality access." }, { status: 403 });
    await assertMobileProjectAccess(service, identity.userId, projectId);

    const { data: towers, error: towerError } = await service
      .from("towers")
      .select("id,project_id,name,line,status,progress,extra_data")
      .eq("project_id", projectId)
      .order("name");
    if (towerError) throw new Error(towerError.message);
    const towerIds = (towers ?? []).map((tower) => tower.id);

    const [issues, members, revisions, items, files, defects] = await Promise.all([
      service.from("project_field_issue_types").select("id,project_id,applies_to,name,active,sort_order").eq("project_id", projectId).eq("active", true).order("sort_order").order("name"),
      towerIds.length
        ? service.from("tower_material_members").select("id,tower_id,bundle_reference,drawing_number,mark_no,qty_per_tower,section,tower_segment").in("tower_id", towerIds).order("tower_id").order("tower_segment").order("mark_no")
        : Promise.resolve({ data: [], error: null }),
      service.from("tower_revisions").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      service.from("tower_revision_items").select("*").eq("project_id", projectId).order("sort_order").order("item_number"),
      service.from("tower_quality_files").select("id,project_id,tower_id,defect_id,revision_id,revision_item_id,file_role,file_name,mime_type,captured_at,uploaded_by_label,created_at").eq("project_id", projectId).order("created_at", { ascending: false }),
      service.from("tower_defects").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
    ]);
    for (const result of [issues, members, revisions, items, files, defects]) if (result.error) throw new Error(result.error.message);

    return NextResponse.json({
      projectId,
      generatedAt: new Date().toISOString(),
      towers: towers ?? [], issueTypes: issues.data ?? [], members: members.data ?? [], revisions: revisions.data ?? [], items: items.data ?? [], files: files.data ?? [], defects: defects.data ?? [],
      workflow: {
        defectSeverities: ["Minor", "Major", "Critical"],
        defectStatuses: ["Open", "In Progress", "Fixed", "Closed"],
        revisionStatuses: ["Draft", "In Progress", "Ready for Review", "Closed"],
        revisionItemStatuses: ["Open", "Rectified", "Verified"],
        inspectionStages: ["Post Assembly", "Post Erection", "Other"],
      },
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    const status = error instanceof Error && error.message === "MOBILE_PROJECT_DENIED" ? 403 : apiError.status;
    const message = error instanceof Error && error.message === "MOBILE_PROJECT_DENIED" ? "You do not have access to this project." : apiError.message;
    return NextResponse.json({ error: message }, { status });
  }
}
