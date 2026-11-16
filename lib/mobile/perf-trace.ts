import type { NextRequest } from "next/server";
import { isSafeMobileTraceId, shouldTraceMobileRequest } from "@/lib/mobile/perf-trace-policy";

export type MobilePerfTrace = {
  id: string;
  route: string;
  requestedProjectId: string | null;
  log: (stage: string, fields?: Record<string, string | number | boolean | null>) => void;
};

export function mobilePerfTrace(request: NextRequest): MobilePerfTrace | null {
  const development = process.env.NODE_ENV === "development";
  const productionEnabled = process.env.TTTRACKER_PERF_TRACE;
  const route = request.nextUrl.pathname
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]")
    .replace(/\/(\d{5,})(?=\/|$)/g, "/[id]");
  if (!shouldTraceMobileRequest(development, productionEnabled, request.nextUrl.pathname)) return null;

  const id = request.headers.get("x-tttracker-trace-id") ?? "";
  if (!isSafeMobileTraceId(id)) return null;

  return {
    id,
    route,
    requestedProjectId: request.nextUrl.searchParams.get("projectId"),
    log(stage, fields = {}) {
      console.info(`[mobile-request] ${stage}`, {
        trace: id,
        route,
        requestedProjectId: request.nextUrl.searchParams.get("projectId"),
        ...fields,
      });
    },
  };
}

