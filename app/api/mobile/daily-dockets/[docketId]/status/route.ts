import { NextResponse } from "next/server";
import { mobileDocketApiError, requireMobileDocketUser } from "@/lib/dockets/mobile-docket-server";
import { isSubmittedDailyDocketStatus } from "@/lib/dockets/submission-status";

type RouteContext = { params: Promise<{ docketId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { docketId } = await context.params;
    const projectId = new URL(request.url).searchParams.get("projectId")?.trim() ?? "";
    if (!docketId || !projectId) {
      return NextResponse.json({ error: "Project and Daily Docket are required." }, { status: 400 });
    }

    const { service } = await requireMobileDocketUser(request, projectId);
    const { data, error } = await service.from("tower_daily_dockets")
      .select("id,approval_status,approval_revision,bc_submitted_at")
      .eq("id", docketId)
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(`Daily Docket submission status could not be checked: ${error.message}`);
    if (!data) return NextResponse.json({ error: "Daily Docket not found." }, { status: 404 });

    const status = String(data.approval_status ?? "legacy");
    return NextResponse.json({
      docketId: data.id,
      status,
      revision: Math.max(0, Number(data.approval_revision) || 0),
      submittedAt: data.bc_submitted_at ?? null,
      submitted: isSubmittedDailyDocketStatus(status),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const apiError = mobileDocketApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
