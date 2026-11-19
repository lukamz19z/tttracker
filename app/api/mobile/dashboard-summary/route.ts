import { NextRequest, NextResponse } from "next/server";

import { createServiceClient, getRequestUser } from "@/lib/access/server";
import { mobileApiError } from "@/lib/mobile/server";
import { mobilePerfTrace } from "@/lib/mobile/perf-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const trace = mobilePerfTrace(request);
  const mark = (phase: string, since: number, fields: Record<string, string | number | boolean | null> = {}) =>
    trace?.log(phase, { durationMs: Date.now() - since, ...fields });

  try {
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
    if (!projectId) return NextResponse.json({ error: "Project ID is required." }, { status: 400 });

    const authStartedAt = Date.now();
    const user = await getRequestUser(request);
    mark("auth-ok", authStartedAt, { userId: user.id });
    const service = createServiceClient();

    const queryStartedAt = Date.now();
    trace?.log("dashboard-summary-start", { userId: user.id, requestedProjectId: projectId });
    const { data, error } = await service.rpc("mobile_project_dashboard_summary", {
      p_project_id: projectId,
      p_user_id: user.id,
    });
    if (error) {
      mark("dashboard-summary-failed", queryStartedAt, { errorCode: error.code ?? null });
      const status = error.code === "57014" ? 504 : error.code?.startsWith("08") ? 503 : 500;
      const response = NextResponse.json({ error: status === 504 ? "Project dashboard summary timed out. Retry this card." : "Project dashboard summary is temporarily unavailable." }, { status });
      if (trace) {
        response.headers.set("x-tttracker-trace-id", trace.id);
        if (trace.attemptId) response.headers.set("x-tttracker-trace-attempt", trace.attemptId);
      }
      return response;
    }
    if (!data) return NextResponse.json({ error: "You do not have permission to view this project summary." }, { status: 403 });
    mark("dashboard-summary-complete", queryStartedAt, { outcome: "success" });
    mark("total", startedAt);
    const response = NextResponse.json(data ?? {}, {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `auth;dur=${queryStartedAt - authStartedAt}, aggregate;dur=${Date.now() - queryStartedAt}, total;dur=${Date.now() - startedAt}`,
      },
    });
    if (trace) {
      response.headers.set("x-tttracker-trace-id", trace.id);
      if (trace.attemptId) response.headers.set("x-tttracker-trace-attempt", trace.attemptId);
    }
    return response;
  } catch (error) {
    mark("failed_total", startedAt);
    const apiError = mobileApiError(error);
    const response = NextResponse.json({ error: apiError.message }, { status: apiError.status });
    if (trace) {
      response.headers.set("x-tttracker-trace-id", trace.id);
      if (trace.attemptId) response.headers.set("x-tttracker-trace-attempt", trace.attemptId);
    }
    return response;
  }
}
