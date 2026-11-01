export type MaterialIssueKind = "missing" | "excess";

export function buildMaterialIssueRoute(input: {
  projectId: string;
  towerId: string;
  issueKey: string;
  eventId?: string | null;
  kind: MaterialIssueKind;
}) {
  const path = `/project/${encodeURIComponent(input.projectId)}/tower/${encodeURIComponent(input.towerId)}/materials`;
  const query = new URLSearchParams({ issue: input.issueKey, kind: input.kind });
  if (input.eventId) query.set("eventId", input.eventId);
  return `${path}?${query.toString()}`;
}

export function buildMaterialIssueOpenRoute(input: Parameters<typeof buildMaterialIssueRoute>[0]) {
  const path = `/open/materials/${encodeURIComponent(input.projectId)}/${encodeURIComponent(input.towerId)}/${encodeURIComponent(input.issueKey)}`;
  const query = new URLSearchParams({ kind: input.kind });
  if (input.eventId) query.set("eventId", input.eventId);
  return `${path}?${query.toString()}`;
}

export function materialAppOrigin() {
  let value = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "").trim();
  if (!value) throw new Error("Set NEXT_PUBLIC_APP_URL for TTTracker Material notifications.");
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  const url = new URL(value);
  url.protocol = "https:";
  if (url.hostname.toLowerCase() === "tttracker.com.au") url.hostname = "www.tttracker.com.au";
  return url.origin;
}

export function buildMaterialIssueUrl(input: Parameters<typeof buildMaterialIssueRoute>[0]) {
  return `${materialAppOrigin()}${buildMaterialIssueOpenRoute(input)}`;
}
