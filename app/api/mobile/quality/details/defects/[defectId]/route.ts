import { NextRequest, NextResponse } from "next/server";
import { loadQualityProject } from "@/lib/quality/server";
import { qualityTimeZone } from "@/lib/quality/date-time";
import { qualityDisplayName } from "@/lib/quality/display-name";
import { defectEvidenceContext } from "@/lib/quality/evidence-context";

import { assertMobileProjectAccess } from "@/lib/mobile/quality";
import {
  mobileApiError,
  requireMobilePermission,
} from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ defectId: string }> },
) {
  try {
    const { service, identity } =
      await requireMobilePermission(
        request,
        "mobile.defects",
      );

    const { defectId } = await context.params;
    const projectId =
      request.nextUrl.searchParams.get("projectId")?.trim() ||
      "";

    if (!projectId || !defectId) {
      return NextResponse.json(
        { error: "Project ID and Defect ID are required." },
        { status: 400 },
      );
    }

    await assertMobileProjectAccess(
      service,
      identity.userId,
      projectId,
    );

    const [defectResult, filesResult] = await Promise.all([
      service
        .from("tower_defects")
        .select("*")
        .eq("id", defectId)
        .eq("project_id", projectId)
        .maybeSingle(),
      service
        .from("tower_quality_files")
        .select(
          "id,project_id,tower_id,defect_id,revision_id,revision_item_id,file_role,file_name,mime_type,captured_at,uploaded_by_label,created_at",
        )
        .eq("project_id", projectId)
        .eq("defect_id", defectId)
        .order("created_at", { ascending: false }),
    ]);

    if (defectResult.error) {
      throw new Error(defectResult.error.message);
    }
    if (filesResult.error) {
      throw new Error(filesResult.error.message);
    }
    if (!defectResult.data) {
      return NextResponse.json(
        { error: "Defect not found." },
        { status: 404 },
      );
    }

    const defect=defectResult.data;
    const project=await loadQualityProject(service,projectId);
    const [tower,issue]=await Promise.all([
      service.from("towers").select("name").eq("id",defect.tower_id).eq("project_id",projectId).maybeSingle(),
      defect.issue_type_id ? service.from("project_field_issue_types").select("name").eq("id",defect.issue_type_id).maybeSingle() : Promise.resolve({data:null,error:null}),
    ]);
    if(tower.error || issue.error) throw new Error(tower.error?.message || issue.error?.message);
    return NextResponse.json({
      projectId,
      generatedAt: new Date().toISOString(),
      defect: {...defect,assigned_to_label:defect.assigned_to_label ? qualityDisplayName(defect.assigned_to_label):null},
      evidenceContext:{...defectEvidenceContext(defect,tower.data?.name,issue.data?.name),project:project.project_number,timeZone:qualityTimeZone(project.timezone)},
      files: filesResult.data ?? [],
    });
  } catch (error) {
    const apiError = mobileApiError(error);
    const denied =
      error instanceof Error &&
      error.message === "MOBILE_PROJECT_DENIED";

    return NextResponse.json(
      {
        error: denied
          ? "You do not have access to this project."
          : apiError.message,
      },
      { status: denied ? 403 : apiError.status },
    );
  }
}
