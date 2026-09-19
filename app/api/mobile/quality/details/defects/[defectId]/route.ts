import { NextRequest, NextResponse } from "next/server";

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

    return NextResponse.json({
      projectId,
      generatedAt: new Date().toISOString(),
      defect: defectResult.data,
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
