import { apiFetch } from "@/lib/api/client";
import type { ResolvedMobileTowerProgress } from "@/types/daily-dockets";

type TowerProgressResponse = { progress: Record<string, ResolvedMobileTowerProgress> };

// Never log headers, request URLs, raw HTML attributes or opaque credentials.
function safeResponsePreview(text: string) {
  return text
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/Bearer\s+[^\s"<>]+/gi, "Bearer [redacted]")
    .replace(/("?(?:access_token|refresh_token|token|authorization|api_key|secret)"?\s*[:=]\s*)[^,\s}]+/gi, "$1[redacted]")
    .replace(/https?:\/\/[^\s"<>]+/gi, "[URL]")
    .replace(/[A-Za-z0-9_+/.=-]{24,}/g, "[redacted]")
    .replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function readTowerProgressResponse(response: Response): Promise<TowerProgressResponse> {
  const text = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const isJson = /^(?:application\/(?:[\w.-]+\+)?json)(?:\s*;|$)/i.test(contentType);
  const log = () => console.error("Tower Progress service response", {
    ok: response.ok, status: response.status, contentType,
    redirected: response.redirected, preview: safeResponsePreview(text),
  });
  if (response.redirected || !isJson || !text.trim()) {
    log();
    throw new Error(`Tower Progress service returned HTTP ${response.status}${response.redirected ? " after a redirect" : ""} instead of JSON. Check that the website API has been deployed.`);
  }
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    log();
    throw new Error(`Tower Progress service returned invalid JSON (HTTP ${response.status}). Check that the website API has been deployed.`);
  }
  if (!response.ok) {
    const error = payload && typeof payload === "object" && "error" in payload ? payload.error : null;
    throw new Error(typeof error === "string" && error.trim() ? error : `Tower Progress service returned HTTP ${response.status}.`);
  }
  if (!payload || typeof payload !== "object" || !("progress" in payload) ||
      !payload.progress || typeof payload.progress !== "object" || Array.isArray(payload.progress) ||
      !Object.values(payload.progress).every((row: unknown) => row && typeof row === "object" &&
        "assemblyPercent" in row && typeof row.assemblyPercent === "number" && Number.isFinite(row.assemblyPercent) &&
        "erectionPercent" in row && typeof row.erectionPercent === "number" && Number.isFinite(row.erectionPercent) &&
        "totalProgressPercent" in row && typeof row.totalProgressPercent === "number" && Number.isFinite(row.totalProgressPercent) &&
        "status" in row && ["Not Started", "In Progress", "Complete"].includes(String(row.status)))) {
    log();
    throw new Error(`Tower Progress service returned an unexpected response (HTTP ${response.status}). Check that the website API has been deployed.`);
  }
  return payload as TowerProgressResponse;
}

export async function getTowerProgress(projectId: string) {
  const response = await apiFetch(`/api/mobile/tower-progress?projectId=${encodeURIComponent(projectId)}`, {
    headers: { Accept: "application/json" },
  });
  return readTowerProgressResponse(response);
}
