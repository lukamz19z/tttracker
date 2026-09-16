import { apiJson, jsonBody } from "@/lib/api/client";
import { enqueue, type QueueRecord } from "@/lib/offline/db";
import { removeOfflineFile } from "@/lib/offline/files";
import { uploadQualityPhoto } from "@/lib/api/quality";
import type {
  DefectSeverity,
  InspectionStage,
  LocalQualityPhoto,
  RevisionItemStatus,
} from "@/types/quality";

function mutationId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export type OfflineDefectCreate = {
  clientMutationId: string;
  projectId: string;
  towerId: string;
  issueTypeId: string | null;
  memberNumber: string | null;
  segment: string | null;
  drawingNumber: string | null;
  description: string;
  responsibility: string | null;
  clientReference: string | null;
  severity: DefectSeverity;
  assignedToUserId: string | null;
  photos: LocalQualityPhoto[];
};

export type OfflineRevisionCreate = {
  clientMutationId: string;
  projectId: string;
  towerId: string;
  inspectionStage: InspectionStage;
  inspectionDate: string;
  clientInspector: string | null;
  clientCompany: string | null;
  clientReference: string | null;
  notes: string | null;
  firstFinding: null | {
    clientMutationId: string;
    issueTypeId: string | null;
    otherIssueText: string | null;
    towerSegment: string | null;
    memberNumber: string | null;
    drawingNumber: string | null;
    finding: string;
    rectificationComment: string | null;
    status: RevisionItemStatus;
    beforePhotos: LocalQualityPhoto[];
    afterPhotos: LocalQualityPhoto[];
  };
};

export type OfflineRevisionItemCreate = {
  clientMutationId: string;
  revisionId: string;
  projectId: string;
  towerId: string;
  issueTypeId: string | null;
  otherIssueText: string | null;
  towerSegment: string | null;
  memberNumber: string | null;
  drawingNumber: string | null;
  finding: string;
  rectificationComment: string | null;
  status: RevisionItemStatus;
  beforePhotos: LocalQualityPhoto[];
  afterPhotos: LocalQualityPhoto[];
};

export type OfflineRevisionItemUpdate = {
  clientMutationId: string;
  revisionId: string;
  itemId: string;
  projectId: string;
  towerId: string;
  rectificationComment: string;
  status: RevisionItemStatus;
  afterPhotos: LocalQualityPhoto[];
};

export async function enqueueDefectCreate(input: Omit<OfflineDefectCreate, "clientMutationId">) {
  const clientMutationId = mutationId("defect");
  await enqueue("quality_defect_create", { ...input, clientMutationId }, clientMutationId);
  return clientMutationId;
}

export async function enqueueRevisionCreate(
  input: Omit<OfflineRevisionCreate, "clientMutationId" | "firstFinding"> & {
    firstFinding: null | Omit<NonNullable<OfflineRevisionCreate["firstFinding"]>, "clientMutationId">;
  },
) {
  const clientMutationId = mutationId("revision");
  const firstFinding = input.firstFinding
    ? { ...input.firstFinding, clientMutationId: mutationId("revision-item") }
    : null;
  await enqueue("quality_revision_create", { ...input, clientMutationId, firstFinding }, clientMutationId);
  return clientMutationId;
}

export async function enqueueRevisionItemCreate(input: Omit<OfflineRevisionItemCreate, "clientMutationId">) {
  const clientMutationId = mutationId("revision-item");
  await enqueue("quality_revision_item_create", { ...input, clientMutationId }, clientMutationId);
  return clientMutationId;
}

export async function enqueueRevisionItemUpdate(input: Omit<OfflineRevisionItemUpdate, "clientMutationId">) {
  const clientMutationId = mutationId("revision-rectification");
  await enqueue("quality_revision_item_update", { ...input, clientMutationId }, clientMutationId);
  return clientMutationId;
}

async function cleanup(photos: LocalQualityPhoto[]) {
  for (const photo of photos) await removeOfflineFile(photo.uri);
}

async function uploadPhotos({
  projectId,
  towerId,
  revisionId,
  revisionItemId,
  defectId,
  role,
  photos,
}: {
  projectId: string;
  towerId: string;
  revisionId?: string;
  revisionItemId?: string;
  defectId?: string;
  role: "defect_photo" | "before_photo" | "after_photo";
  photos: LocalQualityPhoto[];
}) {
  for (const photo of photos) {
    await uploadQualityPhoto({
      projectId,
      towerId,
      revisionId,
      revisionItemId,
      defectId,
      fileRole: role,
      uri: photo.uri,
      name: photo.name,
      mimeType: photo.mimeType,
      capturedAt: photo.capturedAt,
    });
  }
  await cleanup(photos);
}

async function syncDefect(payload: OfflineDefectCreate) {
  const result = await apiJson<{ defect: { id: string } }>("/api/mobile/quality/defects", {
    method: "POST",
    body: jsonBody({ ...payload, photos: undefined }),
  });
  await uploadPhotos({
    projectId: payload.projectId,
    towerId: payload.towerId,
    defectId: result.defect.id,
    role: "defect_photo",
    photos: payload.photos,
  });
}

async function createRevisionItem(payload: OfflineRevisionItemCreate) {
  const result = await apiJson<{ item: { id: string } }>(
    `/api/mobile/quality/revisions/${encodeURIComponent(payload.revisionId)}/items`,
    { method: "POST", body: jsonBody({ ...payload, beforePhotos: undefined, afterPhotos: undefined }) },
  );
  await uploadPhotos({
    projectId: payload.projectId,
    towerId: payload.towerId,
    revisionId: payload.revisionId,
    revisionItemId: result.item.id,
    role: "before_photo",
    photos: payload.beforePhotos,
  });
  await uploadPhotos({
    projectId: payload.projectId,
    towerId: payload.towerId,
    revisionId: payload.revisionId,
    revisionItemId: result.item.id,
    role: "after_photo",
    photos: payload.afterPhotos,
  });
}

async function syncRevision(payload: OfflineRevisionCreate) {
  const result = await apiJson<{ revision: { id: string } }>("/api/mobile/quality/revisions", {
    method: "POST",
    body: jsonBody({ ...payload, firstFinding: undefined }),
  });
  if (payload.firstFinding) {
    await createRevisionItem({
      ...payload.firstFinding,
      revisionId: result.revision.id,
      projectId: payload.projectId,
      towerId: payload.towerId,
    });
  }
}

async function syncRevisionItemUpdate(payload: OfflineRevisionItemUpdate) {
  await apiJson<{ item: { id: string } }>(
    `/api/mobile/quality/revisions/${encodeURIComponent(payload.revisionId)}/items/${encodeURIComponent(payload.itemId)}`,
    {
      method: "PATCH",
      body: jsonBody({
        rectificationComment: payload.rectificationComment,
        status: payload.status,
      }),
    },
  );
  await uploadPhotos({
    projectId: payload.projectId,
    towerId: payload.towerId,
    revisionId: payload.revisionId,
    revisionItemId: payload.itemId,
    role: "after_photo",
    photos: payload.afterPhotos,
  });
}

export async function syncQualityQueueRecord(record: QueueRecord) {
  if (record.kind === "quality_defect_create") return syncDefect(record.payload as OfflineDefectCreate);
  if (record.kind === "quality_revision_create") return syncRevision(record.payload as OfflineRevisionCreate);
  if (record.kind === "quality_revision_item_create") return createRevisionItem(record.payload as OfflineRevisionItemCreate);
  if (record.kind === "quality_revision_item_update") return syncRevisionItemUpdate(record.payload as OfflineRevisionItemUpdate);
  throw new Error(`Unsupported Quality queue item: ${record.kind}`);
}
