import { NextRequest, NextResponse } from "next/server";
import { assertMobileProjectAccess } from "@/lib/mobile/quality";
import { mobileApiError, requireMobilePermission } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFECT_FIELDS = "id,project_id,tower_id,defect_number,issue_type_id,member_number,segment,description,status";
const ITEM_FIELDS = "id,project_id,tower_id,revision_id,fli_number,item_number,issue_type_id,other_issue_text,tower_segment,leg,member_number,finding,status";

export async function GET(request: NextRequest, context: { params: Promise<{ kind: string; recordId: string }> }) {
  try {
    const { kind, recordId } = await context.params;
    if (kind !== "defects" && kind !== "revision-items") {
      return NextResponse.json({ error: "Unsupported quality preview type." }, { status: 404 });
    }
    const permission = kind === "defects" ? "mobile.defects" : "mobile.rectifications";
    const { service, identity } = await requireMobilePermission(request, permission);
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() || "";
    if (!projectId || !recordId) return NextResponse.json({ error: "Project ID and record ID are required." }, { status: 400 });
    await assertMobileProjectAccess(service, identity.userId, projectId);

    let record: Record<string, unknown>;
    let revisionId: string | null = null;
    if (kind === "defects") {
      const { data, error } = await service.from("tower_defects").select(DEFECT_FIELDS).eq("id", recordId).eq("project_id", projectId).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Defect not found." }, { status: 404 });
      record = data as Record<string, unknown>;
    } else {
      const { data, error } = await service.from("tower_revision_items").select(ITEM_FIELDS).eq("id", recordId).eq("project_id", projectId).maybeSingle();
      if (error) throw error;
      if (!data) return NextResponse.json({ error: "Revision finding not found." }, { status: 404 });
      record = data as Record<string, unknown>;
      revisionId = String(data.revision_id);
    }

    const towerId = String(record.tower_id ?? "");
    const issueTypeId = String(record.issue_type_id ?? "");
    const [towerResult, issueResult, fileResult] = await Promise.all([
      towerId ? service.from("towers").select("name").eq("id", towerId).eq("project_id", projectId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      issueTypeId ? service.from("project_field_issue_types").select("name").eq("id", issueTypeId).eq("project_id", projectId).maybeSingle() : Promise.resolve({ data: null, error: null }),
      service.from("tower_quality_files").select("id,file_role,file_name,created_at").eq("project_id", projectId).eq(kind === "defects" ? "defect_id" : "revision_item_id", recordId).eq("deletion_pending", false).eq("is_outdated", false).in("file_role", kind === "defects" ? ["defect_photo"] : ["before_photo", "after_photo"]).order("created_at", { ascending: true }).limit(12),
    ]);
    if (towerResult.error || issueResult.error || fileResult.error) throw towerResult.error || issueResult.error || fileResult.error;
    const files = fileResult.data ?? [];
    const first = (role: string) => files.find(file => file.file_role === role) ?? null;
    const before = kind === "defects" ? first("defect_photo") : first("before_photo");
    const after = kind === "defects" ? null : first("after_photo");
    return NextResponse.json({
      projectId,
      revisionId: revisionId || (record.revision_id ? String(record.revision_id) : null),
      recordId,
      kind,
      number: String(record.fli_number ?? record.defect_number ?? (record.item_number ? `FLI-${String(record.item_number).padStart(3, "0")}` : "")),
      tower: towerResult.data?.name ?? "",
      section: String(record.tower_segment ?? record.segment ?? ""),
      leg: String(record.leg ?? ""),
      issueType: issueResult.data?.name ?? (record.other_issue_text ? String(record.other_issue_text) : "Other"),
      status: String(record.status ?? ""),
      shortDescription: String(record.finding ?? record.description ?? "").slice(0, 240),
      beforeFileId: before?.id ?? null,
      beforeFileName: before?.file_name ?? null,
      afterFileId: after?.id ?? null,
      afterFileName: after?.file_name ?? null,
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    const denied = error instanceof Error && error.message === "MOBILE_PROJECT_DENIED";
    return NextResponse.json({ error: denied ? "You do not have access to this project." : apiError.message }, { status: denied ? 403 : apiError.status });
  }
}
