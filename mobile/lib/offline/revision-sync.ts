import { apiJson, apiFetch } from "@/lib/api/client";
import { enqueue, type QueueRecord } from "@/lib/offline/db";
import { persistOfflineFile, removeOfflineFile } from "@/lib/offline/files";
import { supabase } from "@/lib/supabase";

export type OfflinePhoto = {
  uri: string;
  name: string;
  mimeType: string;
  role: "before_photo" | "after_photo";
};

export type OfflineRevisionDraft = {
  localId: string;
  projectId: string;
  towerId: string;
  revisionId?: string | null;
  inspectionStage: "Post Assembly" | "Post Erection" | "Other";
  inspectionDate: string;
  clientInspector?: string;
  clientCompany?: string;
  clientReference?: string;
  revisionNotes?: string;
  issueTypeId?: string | null;
  otherIssueText?: string | null;
  towerSegment?: string | null;
  memberNumber?: string | null;
  drawingNumber?: string | null;
  finding: string;
  rectificationComment?: string | null;
  photos: OfflinePhoto[];
};

type NativeFile = { uri: string; name: string; type: string };

export async function queueOfflineRevision(input: Omit<OfflineRevisionDraft, "localId" | "photos"> & { photos: OfflinePhoto[] }) {
  const localId = crypto.randomUUID();
  const persisted: OfflinePhoto[] = [];

  for (const photo of input.photos) {
    persisted.push({
      ...photo,
      uri: await persistOfflineFile(photo.uri, `revision-${localId}-${photo.role}`),
    });
  }

  const payload: OfflineRevisionDraft = { ...input, localId, photos: persisted };
  await enqueue("revision_draft", payload, localId);
  return localId;
}

async function uploadPhoto({
  projectId,
  towerId,
  revisionId,
  itemId,
  photo,
}: {
  projectId: string;
  towerId: string;
  revisionId: string;
  itemId: string;
  photo: OfflinePhoto;
}) {
  const form = new FormData();
  form.append("projectId", projectId);
  form.append("towerId", towerId);
  form.append("revisionId", revisionId);
  form.append("revisionItemId", itemId);
  form.append("fileRole", photo.role);
  form.append("capturedAt", new Date().toISOString());
  form.append("file", { uri: photo.uri, name: photo.name, type: photo.mimeType } as unknown as Blob);

  const response = await apiFetch("/api/quality/files/upload", { method: "POST", body: form, timeoutMs: 120_000 });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Could not upload ${photo.name}.`);
  }
}

export async function syncRevisionQueueRecord(record: QueueRecord) {
  const payload = record.payload as OfflineRevisionDraft;
  const { data: userResult } = await supabase.auth.getUser();
  const user = userResult.user;
  if (!user) throw new Error("You must be signed in before this revision can sync.");

  let revisionId = payload.revisionId ?? null;

  if (!revisionId) {
    const { data, error } = await supabase
      .from("tower_revisions")
      .insert({
        project_id: payload.projectId,
        tower_id: payload.towerId,
        inspection_stage: payload.inspectionStage,
        inspection_date: payload.inspectionDate,
        client_inspector: payload.clientInspector?.trim() || null,
        client_company: payload.clientCompany?.trim() || null,
        client_reference: payload.clientReference?.trim() || null,
        notes: payload.revisionNotes?.trim() || null,
        status: "Draft",
        created_by: user.id,
        created_by_label:
          user.user_metadata?.full_name || user.user_metadata?.name || user.email || "TTTracker User",
      })
      .select("id")
      .single();
    if (error) throw error;
    revisionId = String(data.id);
  }

  const hasAfter = payload.photos.some((photo) => photo.role === "after_photo");
  const { data: item, error: itemError } = await supabase
    .from("tower_revision_items")
    .insert({
      revision_id: revisionId,
      project_id: payload.projectId,
      tower_id: payload.towerId,
      issue_type_id: payload.issueTypeId || null,
      other_issue_text: payload.otherIssueText?.trim() || null,
      tower_segment: payload.towerSegment?.trim() || null,
      member_number: payload.memberNumber?.trim() || null,
      drawing_number: payload.drawingNumber?.trim() || null,
      finding: payload.finding.trim(),
      rectification_comment: payload.rectificationComment?.trim() || null,
      status: hasAfter ? "Rectified" : "Open",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (itemError) throw itemError;
  const itemId = String(item.id);

  for (const photo of payload.photos) {
    await uploadPhoto({
      projectId: payload.projectId,
      towerId: payload.towerId,
      revisionId,
      itemId,
      photo,
    });
  }

  await supabase
    .from("tower_revisions")
    .update({ status: "In Progress" })
    .eq("id", revisionId)
    .eq("status", "Draft");

  for (const photo of payload.photos) await removeOfflineFile(photo.uri);

  return { revisionId, itemId };
}
