import { supabase } from "@/lib/supabase";
import type { LocalQualityPhoto } from "@/types/quality";

const RAW_WEB_BASE_URL =
  process.env.EXPO_PUBLIC_TTTRACKER_WEB_URL ||
  "https://www.tttracker.com.au";

const WEB_BASE_URL = RAW_WEB_BASE_URL
  .replace(/^https:\/\/tttracker\.com\.au(?=\/|$)/i, "https://www.tttracker.com.au")
  .replace(/\/+$/, "");

export type MobileDefectSeverity = "Minor" | "Major" | "Critical";
export type MobileDefectStatus = "Open" | "In Progress" | "Fixed" | "Closed";

export type DefectAssignee = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type DefectActionRow = {
  id: string;
  defect_id: string;
  action_note: string;
  created_by: string | null;
  created_at: string;
};

type JsonObject = Record<string, unknown>;

async function authenticatedFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your TTTracker session has expired. Sign in again.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);

  if (
    init.body &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${WEB_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

async function readJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const text = await response.text();
  let payload: unknown = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) throw new Error(text || fallback);
  }

  if (!response.ok) {
    const error =
      payload &&
      typeof payload === "object" &&
      "error" in payload
        ? String((payload as { error?: unknown }).error ?? "")
        : "";

    throw new Error(error || fallback);
  }

  return payload as T;
}

export async function createDefect(body: {
  projectId: string;
  towerId: string;
  issueTypeId: string | null;
  memberNumber: string | null;
  segment: string | null;
  drawingNumber: string | null;
  description: string;
  responsibility: string | null;
  clientReference: string | null;
  severity: MobileDefectSeverity;
  assignedToUserId: string | null;
}) {
  const response = await authenticatedFetch("/api/quality/defects", {
    method: "POST",
    body: JSON.stringify({
      ...body,
      source: "mobile",
    }),
  });

  return readJson<{
    defect?: JsonObject;
    warning?: string | null;
  }>(response, "Defect could not be created.");
}

export async function patchDefect(
  defectId: string,
  patch: {
    issueTypeId?: string | null;
    memberNumber?: string | null;
    segment?: string | null;
    drawingNumber?: string | null;
    description?: string;
    responsibility?: string | null;
    clientReference?: string | null;
    severity?: MobileDefectSeverity;
    status?: MobileDefectStatus;
    resolutionNotes?: string | null;
    assignedToUserId?: string | null;
  },
) {
  const response = await authenticatedFetch(
    `/api/quality/defects/${encodeURIComponent(defectId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );

  return readJson<{
    defect?: JsonObject;
    warning?: string | null;
  }>(response, "Defect could not be updated.");
}

export async function addDefectAction(
  defectId: string,
  action: string,
) {
  const response = await authenticatedFetch(
    `/api/quality/defects/${encodeURIComponent(defectId)}/actions`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
  );

  return readJson<{
    action?: DefectActionRow;
    warning?: string | null;
  }>(response, "Defect action could not be saved.");
}

export async function getDefectAssignees(projectId: string) {
  const response = await authenticatedFetch(
    `/api/quality/defects/notification-settings?projectId=${encodeURIComponent(projectId)}`,
  );

  const payload = await readJson<{
    users?: DefectAssignee[];
  }>(response, "Defect assignees could not be loaded.");

  return payload.users ?? [];
}

function photoName(photo: LocalQualityPhoto) {
  const value = String((photo as { name?: unknown }).name ?? "").trim();
  return value || `defect-${Date.now()}.jpg`;
}

function photoMime(photo: LocalQualityPhoto) {
  const declared = String(
    (photo as { mimeType?: unknown }).mimeType ?? "",
  ).trim();

  if (declared) return declared;

  const name = photoName(photo).toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".heic")) return "image/heic";
  if (name.endsWith(".heif")) return "image/heif";
  return "image/jpeg";
}

export async function uploadDefectPhoto(args: {
  projectId: string;
  towerId: string;
  defectId: string;
  photo: LocalQualityPhoto;
}) {
  const form = new FormData();
  const capturedAt =
    String(
      (args.photo as { capturedAt?: unknown }).capturedAt ?? "",
    ).trim() || new Date().toISOString();

  form.append("projectId", args.projectId);
  form.append("towerId", args.towerId);
  form.append("defectId", args.defectId);
  form.append("fileRole", "defect_photo");
  form.append("capturedAt", capturedAt);

  form.append(
    "file",
    {
      uri: args.photo.uri,
      name: photoName(args.photo),
      type: photoMime(args.photo),
    } as unknown as Blob,
  );

  const response = await authenticatedFetch(
    "/api/quality/files/upload",
    {
      method: "POST",
      body: form,
    },
  );

  return readJson<JsonObject>(
    response,
    "Defect photo could not be uploaded.",
  );
}
