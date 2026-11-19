import { isSafeMobileTraceId, shouldTraceMobileRequest } from "@/lib/mobile/perf-trace-policy";

export type MobilePerfTrace = {
  id: string;
  attemptId: string | null;
  route: string;
  requestedProjectId: string | null;
  log: (stage: string, fields?: Record<string, string | number | boolean | null>) => void;
};

export function mobilePerfTrace(request: Request): MobilePerfTrace | null {
  const development = process.env.NODE_ENV === "development";
  const productionEnabled = process.env.TTTRACKER_PERF_TRACE;
  const url = new URL(request.url);
  const route = url.pathname
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]")
    .replace(/\/(\d{5,})(?=\/|$)/g, "/[id]");
  if (!shouldTraceMobileRequest(development, productionEnabled, url.pathname)) return null;

  const id = request.headers.get("x-tttracker-trace-id") ?? "";
  if (!isSafeMobileTraceId(id)) return null;
  const rawAttemptId = request.headers.get("x-tttracker-trace-attempt");
  const attemptId = rawAttemptId && rawAttemptId.startsWith(`${id}:attempt-`) && /^\d+$/.test(rawAttemptId.slice(`${id}:attempt-`.length))
    ? rawAttemptId
    : null;

  return {
    id,
    attemptId,
    route,
    requestedProjectId: url.searchParams.get("projectId"),
    log(stage, fields = {}) {
      console.info(`[mobile-request] ${stage}`, {
        trace: id,
        attemptId,
        route,
        requestedProjectId: url.searchParams.get("projectId"),
        ...fields,
      });
    },
  };
}

