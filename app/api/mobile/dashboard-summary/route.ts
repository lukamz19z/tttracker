import { NextRequest, NextResponse } from "next/server";

import { createServiceClient, getRequestUser } from "@/lib/access/server";
import { mobileApiError } from "@/lib/mobile/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const trace = request.headers.get("x-tttracker-trace");
  const mark = (phase: string, since: number) => {
    if (process.env.NODE_ENV === "development" && trace) {
      console.info("[mobile-trace]", { trace, route: "dashboard_summary", phase, durationMs: Date.now() - since });
    }
  };

  try {
    const projectId = request.nextUrl.searchParams.get("projectId")?.trim() ?? "";
    if (!projectId) return NextResponse.json({ error: "Project ID is required." }, { status: 400 });

    const authStartedAt = Date.now();
    const user = await getRequestUser(request);
    const service = createServiceClient();
    mark("auth", authStartedAt);

    const queryStartedAt = Date.now();
    const { data, error } = await service.rpc("mobile_project_dashboard_summary", {
      p_project_id: projectId,
      p_user_id: user.id,
    });
    if (error) throw new Error(`Project dashboard summary failed: ${error.message}`);
    if (!data) return NextResponse.json({ error: "You do not have permission to view this project summary." }, { status: 403 });
    mark("aggregate", queryStartedAt);
    mark("total", startedAt);
    return NextResponse.json(data ?? {}, {
      headers: {
        "Cache-Control": "private, no-store",
        "Server-Timing": `auth;dur=${queryStartedAt - authStartedAt}, aggregate;dur=${Date.now() - queryStartedAt}, total;dur=${Date.now() - startedAt}`,
      },
    });
  } catch (error) {
    mark("failed_total", startedAt);
    const apiError = mobileApiError(error);
    return NextResponse.json({ error: apiError.message }, { status: apiError.status });
  }
}
