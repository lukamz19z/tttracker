import { apiFetch, apiJson, jsonBody } from "@/lib/api/client";
import { annotateQualityPhoto, photoContext } from "@/lib/quality-evidence";
import { uploadQualityPhoto } from "@/lib/api/quality";
import type { LocalQualityPhoto } from "@/types/quality";

export type MobileDefectSeverity = "Minor" | "Major" | "Critical";
export type MobileDefectStatus = "Open" | "In Progress" | "Fixed" | "Closed";

export type DefectAssignee = {
  id: string;
  name: string;
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

const authenticatedFetch = apiFetch;
const readJson = jsonBody;

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
    leg?:string|null;
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
  const result=await apiJson<{evidenceContext:Record<string,unknown>}>(`/api/mobile/quality/details/defects/${encodeURIComponent(args.defectId)}?projectId=${encodeURIComponent(args.projectId)}`);
  const photo=await annotateQualityPhoto(args.photo,photoContext(result.evidenceContext,String(args.photo.watermarkContext?.phase || "BEFORE"),args.photo.capturedAt));
  return uploadQualityPhoto({projectId:args.projectId,towerId:args.towerId,defectId:args.defectId,fileRole:"defect_photo",uri:photo.originalUri || photo.uri,annotatedUri:photo.annotatedUri,name:photoName(photo),mimeType:photoMime(photo),clientMutationId:photo.id,watermarkPosition:photo.watermarkPosition,capturedAt:photo.capturedAt,evidencePhase:String(photo.watermarkContext?.phase || "BEFORE")});
}
