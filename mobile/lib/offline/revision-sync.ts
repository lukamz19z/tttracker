import { enqueue, type QueueRecord } from "@/lib/offline/db";
import { persistOfflineFile, removeOfflineFile } from "@/lib/offline/files";
import { syncQualityQueueRecord } from "./quality-sync";

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

export async function syncRevisionQueueRecord(record: QueueRecord) {
  const payload = record.payload as OfflineRevisionDraft;
  const photos = payload.photos.map((photo, index) => ({ ...photo, id: `${payload.localId}:${photo.role}:${index}`, capturedAt: record.createdAt }));
  const finding = {
    clientMutationId: `legacy-finding:${payload.localId}`,
    projectId: payload.projectId, towerId: payload.towerId,
    issueTypeId: payload.issueTypeId || null, otherIssueText: payload.otherIssueText || null,
    towerSegment: payload.towerSegment || null, memberNumber: payload.memberNumber || null,
    drawingNumber: payload.drawingNumber || null, finding: payload.finding,
    rectificationComment: payload.rectificationComment || null,
    status: photos.some(photo => photo.role === "after_photo") ? "Rectified" : "Open",
    beforePhotos: photos.filter(photo => photo.role === "before_photo"),
    afterPhotos: photos.filter(photo => photo.role === "after_photo"),
  };
  await syncQualityQueueRecord({ ...record,
    kind: payload.revisionId ? "quality_revision_item_create" : "quality_revision_create",
    payload: payload.revisionId ? { ...finding, revisionId: payload.revisionId } : {
      clientMutationId: `legacy-parent:${payload.localId}`, projectId: payload.projectId, towerId: payload.towerId,
      inspectionStage: payload.inspectionStage, inspectionDate: payload.inspectionDate,
      clientInspector: payload.clientInspector || null, clientCompany: payload.clientCompany || null,
      clientReference: payload.clientReference || null, notes: payload.revisionNotes || null, findings: [finding],
    },
  });
  for (const photo of payload.photos) await removeOfflineFile(photo.uri);
}
