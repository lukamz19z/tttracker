import { createClientId } from "@/lib/client-id";

type PerfContext = { projectId: string | null; generation: number };
let context: PerfContext = { projectId: null, generation: 0 };

export function setMobilePerfContext(projectId: string | null, generation: number) {
  context = { projectId, generation };
}

export function mobilePerfEnabled() {
  return __DEV__ || process.env.EXPO_PUBLIC_TTTRACKER_PERF_TRACE === "1";
}

export function safeMobilePathname(pathname: string) {
  if (/\/storage\/v1\//i.test(pathname)) return "/storage/v1/[object]";
  return pathname
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "[id]")
    .replace(/\/(\d{5,})(?=\/|$)/g, "/[id]");
}

function safeProjectFromUrl(url: URL) {
  const direct = url.searchParams.get("projectId");
  if (direct && /^[0-9a-f-]{36}$/i.test(direct)) return direct;
  const filter = url.searchParams.get("project_id");
  const match = filter?.match(/^eq\.([0-9a-f-]{36})$/i);
  return match?.[1] ?? context.projectId;
}

function classify(pathname: string) {
  if (pathname.startsWith("/api/mobile/daily-dockets") || pathname.startsWith("/api/daily-dockets")) return "daily-dockets";
  if (pathname.includes("materials")) return "materials";
  if (pathname.includes("quality") || pathname.includes("defect") || pathname.includes("revision")) return "quality";
  if (pathname.includes("tower-progress")) return "tower-progress";
  if (pathname.includes("project-progress") || pathname.includes("dashboard")) return "project-progress";
  if (pathname.includes("notifications")) return "notifications";
  if (pathname.includes("training")) return "training";
  if (pathname.includes("asset") || pathname.includes("fleet") || pathname.includes("prestart")) return "assets-fleet";
  if (pathname.includes("bootstrap") || pathname.includes("profile")) return "app-context";
  return "mobile-api";
}

export function mobilePerfRequestInfo(input: RequestInfo | URL) {
  const requestObject = typeof Request !== "undefined" && input instanceof Request;
  const raw = requestObject ? input.url : String(input);
  const url = new URL(raw, "https://tttracker.invalid");
  const pathname = safeMobilePathname(url.pathname);
  const method = requestObject ? input.method : "GET";
  const supabaseMatch = url.pathname.match(/\/rest\/v1\/([^/]+)/);
  const auth = /\/auth\/v1\//i.test(url.pathname);
  const moduleName = supabaseMatch ? moduleForResource(supabaseMatch[1]) : auth ? "auth" : classify(url.pathname);
  const operation = supabaseMatch ? `${method.toUpperCase()} ${supabaseMatch[1]}` : /\/storage\/v1\//i.test(url.pathname) ? `${method.toUpperCase()} storage` : `${method.toUpperCase()} ${pathname}`;
  return {
    traceId: createClientId("trace"),
    module: moduleName,
    operation,
    path: pathname,
    projectId: safeProjectFromUrl(url),
    projectGeneration: context.generation,
  };
}

function moduleForResource(resource: string) {
  if (/docket|tower_daily/i.test(resource)) return "daily-dockets";
  if (/material|bundle|tower_required/i.test(resource)) return "materials";
  if (/quality|defect|revision/i.test(resource)) return "quality";
  if (/notification/i.test(resource)) return "notifications";
  if (/training|employee/i.test(resource)) return "training-profile";
  if (/asset|fleet|prestart|crew/i.test(resource)) return "assets-fleet";
  if (/tower|project|progress/i.test(resource)) return "project-progress";
  return "supabase-direct";
}

export function logMobilePerf(stage: string, fields: Record<string, unknown>) {
  if (!mobilePerfEnabled()) return;
  console.info("[mobile-perf]", { stage, ...fields });
}

export function tracedMobileFetch(fetchImpl: typeof fetch, input: RequestInfo | URL, init?: RequestInit) {
  const enabled = mobilePerfEnabled();
  const info = enabled ? mobilePerfRequestInfo(input) : null;
  const startedAt = Date.now();
  const requestObject = typeof Request !== "undefined" && input instanceof Request;
  const method = String(init?.method ?? (requestObject ? input.method : "GET")).toUpperCase();
  if (info) logMobilePerf("request-start", { ...info, method });
  return fetchImpl(input, init).then((response) => {
    if (info) {
      const contentRange = response.headers.get("content-range");
      const countMatch = contentRange?.match(/\/(\d+)$/);
      logMobilePerf("request-complete", {
        ...info,
        method,
        durationMs: Date.now() - startedAt,
        outcome: response.ok ? "success" : "http_failure",
        status: response.status,
        rowCount: countMatch ? Number(countMatch[1]) : null,
      });
    }
    return response;
  }).catch((error: unknown) => {
    if (info) {
      const value = error && typeof error === "object" ? error as { name?: unknown; code?: unknown; status?: unknown } : {};
      const errorName = typeof value.name === "string" ? value.name : "unknown";
      const category = errorName === "AbortError" || value.code === "TT_BACKEND_TIMEOUT" ? "timeout" : error instanceof TypeError ? "network" : "unknown";
      const safeCode = typeof value.code === "string" && /^[A-Z0-9_]{2,24}$/.test(value.code) ? value.code : undefined;
      logMobilePerf("request-failed", {
        ...info,
        method,
        durationMs: Date.now() - startedAt,
        outcome: "failure",
        category,
        errorName,
        ...(safeCode ? { errorCode: safeCode } : {}),
        ...(Number.isInteger(value.status) ? { status: value.status } : {}),
      });
    }
    throw error;
  });
}

