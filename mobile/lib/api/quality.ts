import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { apiFetch, apiJson, jsonBody } from "@/lib/api/client";
import { getCache, setCache } from "@/lib/offline/db";
import type {
  DefectAssignee,
  DefectStatus,
  QualityDefect,
  QualityPayload,
  QualityRevision,
  QualityRevisionItem,
  RevisionItemStatus,
  RevisionStatus,
} from "@/types/quality";

export const qualityCacheKey = (projectId: string) => `quality:${projectId}`;

export async function refreshQuality(projectId: string) {
  const data = await apiJson<QualityPayload>(
    `/api/mobile/quality/bootstrap?projectId=${encodeURIComponent(projectId)}`,
    { timeoutMs: 120000 },
  );
  await setCache(qualityCacheKey(projectId), data);
  return data;
}

export function cachedQuality(projectId: string) {
  return getCache<QualityPayload>(qualityCacheKey(projectId));
}

export async function getDefectAssignees(projectId: string) {
  const payload = await apiJson<{ users?: DefectAssignee[] }>(
    `/api/quality/defects/notification-settings?projectId=${encodeURIComponent(projectId)}`,
  );
  return payload.users ?? [];
}

export async function updateDefect(
  defectId: string,
  patch: {
    issueTypeId?: string | null;
    memberNumber?: string | null;
    segment?: string | null;
    drawingNumber?: string | null;
    description?: string;
    responsibility?: string | null;
    clientReference?: string | null;
    severity?: "Minor" | "Major" | "Critical";
    status?: DefectStatus;
    resolutionNotes?: string | null;
    assignedToUserId?: string | null;
  },
) {
  return apiJson<{ defect: QualityDefect; warning?: string | null }>(
    `/api/quality/defects/${encodeURIComponent(defectId)}`,
    { method: "PATCH", body: jsonBody(patch) },
  );
}

export async function addDefectAction(defectId: string, action: string) {
  return apiJson<{ action: Record<string, unknown>; warning?: string | null }>(
    `/api/quality/defects/${encodeURIComponent(defectId)}/actions`,
    { method: "POST", body: jsonBody({ action }) },
  );
}

export async function updateRevision(
  revisionId: string,
  patch: {
    inspectionStage?: string;
    inspectionDate?: string;
    clientInspector?: string | null;
    clientCompany?: string | null;
    clientReference?: string | null;
    notes?: string | null;
    status?: RevisionStatus;
  },
) {
  return apiJson<{ revision: QualityRevision }>(
    `/api/mobile/quality/revisions/${encodeURIComponent(revisionId)}`,
    { method: "PATCH", body: jsonBody(patch) },
  );
}

export async function updateRevisionItem(
  revisionId: string,
  itemId: string,
  patch: {
    issueTypeId?: string | null;
    otherIssueText?: string | null;
    towerSegment?: string | null;
    memberNumber?: string | null;
    drawingNumber?: string | null;
    finding?: string | null;
    rectificationComment?: string | null;
    status?: RevisionItemStatus;
  },
) {
  return apiJson<{ item: QualityRevisionItem }>(
    `/api/mobile/quality/revisions/${encodeURIComponent(revisionId)}/items/${encodeURIComponent(itemId)}`,
    { method: "PATCH", body: jsonBody(patch) },
  );
}

export async function uploadQualityPhoto(input: {
  projectId: string;
  towerId: string;
  defectId?: string;
  revisionId?: string;
  revisionItemId?: string;
  fileRole: "defect_photo" | "before_photo" | "after_photo";
  uri: string;
  name: string;
  mimeType: string;
  capturedAt?: string;
}) {
  const form = new FormData();
  form.append("projectId", input.projectId);
  form.append("towerId", input.towerId);
  if (input.defectId) form.append("defectId", input.defectId);
  if (input.revisionId) form.append("revisionId", input.revisionId);
  if (input.revisionItemId) form.append("revisionItemId", input.revisionItemId);
  form.append("fileRole", input.fileRole);
  form.append("capturedAt", input.capturedAt ?? new Date().toISOString());
  form.append(
    "file",
    { uri: input.uri, name: input.name, type: input.mimeType } as unknown as Blob,
  );

  const response = await apiFetch("/api/quality/files/upload", {
    method: "POST",
    body: form,
    timeoutMs: 120000,
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? "Quality evidence could not be uploaded.");
  return data;
}

export async function shareQualityFile(fileId: string, fileName: string) {
  const response = await apiFetch(`/api/quality/files/${encodeURIComponent(fileId)}/content`, {
    timeoutMs: 120000,
  });
  if (!response.ok) throw new Error("Quality evidence could not be opened.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const safe = (fileName || "quality-evidence").replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = new File(Paths.cache, `${Date.now()}-${safe}`);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
  return file.uri;
}
