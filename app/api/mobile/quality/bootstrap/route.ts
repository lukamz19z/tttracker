import { NextRequest, NextResponse } from "next/server";

import { userHasAccess } from "@/lib/access/server";
import { assertMobileProjectAccess } from "@/lib/mobile/quality";
import { mobileApiError, requireMobileUser } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { service, identity } = await requireMobileUser(request);
    const projectId =
      request.nextUrl.searchParams.get("projectId")?.trim() || "";

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required." },
        { status: 400 },
      );
    }

    const [canRevision, canDefect] = await Promise.all([
      userHasAccess(
        service,
        identity.userId,
        "mobile.rectifications",
      ),
      userHasAccess(
        service,
        identity.userId,
        "mobile.defects",
      ),
    ]);

    if (!canRevision && !canDefect) {
      return NextResponse.json(
        { error: "You do not have mobile Quality access." },
        { status: 403 },
      );
    }

    await assertMobileProjectAccess(
      service,
      identity.userId,
      projectId,
    );

    /*
     * PERFORMANCE:
     * This endpoint is deliberately metadata-only.
     *
     * Do not put project-wide members, defects, revisions, FLI items or
     * evidence back into this payload. Those registers are now loaded through
     * paginated list/detail endpoints only when the user needs them.
     */
    const [projectResult, towersResult, issuesResult] =
      await Promise.all([
        service
          .from("projects")
          .select("id,name,project_number,status")
          .eq("id", projectId)
          .maybeSingle(),
        service
          .from("towers")
          .select(
            "id,project_id,name,line,status,progress,extra_data",
          )
          .eq("project_id", projectId)
          .order("name"),
        service
          .from("project_field_issue_types")
          .select(
            "id,project_id,applies_to,name,active,sort_order",
          )
          .eq("project_id", projectId)
          .eq("active", true)
          .order("sort_order")
          .order("name"),
      ]);

    for (const result of [
      projectResult,
      towersResult,
      issuesResult,
    ]) {
      if (result.error) {
        throw new Error(result.error.message);
      }
    }

    return NextResponse.json({
      payloadVersion: 2,
      projectId,
      generatedAt: new Date().toISOString(),
      project: projectResult.data ?? null,
      towers: towersResult.data ?? [],
      issueTypes: issuesResult.data ?? [],

      // Retained as empty arrays for backwards type compatibility while the
      // mobile app transitions to the paginated Quality API.
      members: [],
      revisions: [],
      items: [],
      files: [],
      defects: [],

      workflow: {
        defectSeverities: ["Minor", "Major", "Critical"],
        defectStatuses: [
          "Open",
          "In Progress",
          "Fixed",
          "Closed",
        ],
        revisionStatuses: [
          "Draft",
          "In Progress",
          "Ready for Review",
          "Closed",
        ],
        revisionItemStatuses: [
          "Open",
          "Rectified",
          "Verified",
        ],
        inspectionStages: [
          "Post Assembly",
          "Post Erection",
          "Other",
        ],
      },
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
