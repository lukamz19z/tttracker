import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { apiFetch, apiJson } from "@/lib/api/client";
import type { TrainingPayload } from "@/types/training";

export type PickedTrainingFile = {
  uri: string;
  name: string;
  mimeType: string;
};


export async function getMyTraining() {
  return apiJson<TrainingPayload>("/api/mobile/training");
}

export async function uploadTraining(input: {
  employeeId: string;
  trainingTypeId: string;
  projectId?: string;
  issuer?: string;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  notes?: string;
  metadata: Record<string, unknown>;
  selectedOptionIds: string[];
  selectedOptionCodes: string[];
  documentUploadType: string;
  replacementMode: "none" | "replace" | "add";
  supersedesRecordId?: string;
  file?: PickedTrainingFile | null;
  frontFile?: PickedTrainingFile | null;
  backFile?: PickedTrainingFile | null;
}) {
  const form = new FormData();
  form.append("employeeId", input.employeeId);
  form.append("trainingTypeId", input.trainingTypeId);
  form.append("projectId", input.projectId ?? "");
  form.append("issuer", input.issuer ?? "");
  form.append("certificateNumber", input.certificateNumber ?? "");
  form.append("issueDate", input.issueDate ?? "");
  form.append("expiryDate", input.expiryDate ?? "");
  form.append("notes", input.notes ?? "");
  form.append("metadata", JSON.stringify(input.metadata));
  form.append("selectedOptionIds", JSON.stringify(input.selectedOptionIds));
  form.append("selectedOptionCodes", JSON.stringify(input.selectedOptionCodes));
  form.append("documentUploadType", input.documentUploadType);
  form.append("replacementMode", input.replacementMode);
  form.append("supersedesRecordId", input.supersedesRecordId ?? "");
  form.append("source", "mobile_employee_self_service");

  const addFile = (key: string, value?: PickedTrainingFile | null) => {
    if (!value) return;
    form.append(key, { uri: value.uri, name: value.name, type: value.mimeType } as unknown as Blob);
  };

  addFile("file", input.file);
  addFile("frontFile", input.frontFile);
  addFile("backFile", input.backFile);

  const response = await apiFetch("/api/training/records/upload", {
    method: "POST",
    body: form,
    timeoutMs: 120_000,
  });
  const text = await response.text();
  const payload = text ? (JSON.parse(text) as { error?: string; recordId?: string; workflowStatus?: string; notificationWarning?: string | null }) : {};
  if (!response.ok) throw new Error(payload.error ?? "Training record could not be uploaded.");
  return payload;
}

export async function completeChangesRequiredResubmission(oldRecordId: string, newRecordId: string) {
  return apiJson<{ success: boolean }>(`/api/mobile/training/${encodeURIComponent(oldRecordId)}/resubmitted`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newRecordId }),
  });
}

export async function openTrainingDocument(documentId: string, fileName: string) {
  const response = await apiFetch(`/api/training/documents/${encodeURIComponent(documentId)}`, { timeoutMs: 120_000 });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? "Training evidence could not be opened.");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, "_") || "training-document";
  const file = new File(Paths.cache, `${Date.now()}-${safeName}`);
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
}
