import { listRevisionWorkspaces, saveRevisionWorkspace } from "./revision-workspaces";
import { queueRows } from "./db";
import { apiJson } from "@/lib/api/client";
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
  leg?: string | null;
  assignedFlag?: string | null;
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
  findings: {
    clientMutationId: string;
    leg?: string | null;
  assignedFlag?: string | null;
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
  }[];
  /** Backward-compatible with queue records created before the RECT/FLI upgrade. */
  firstFinding?: null | {
    clientMutationId: string;
    leg?: string | null;
  assignedFlag?: string | null;
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
  leg?: string | null;
  assignedFlag?: string | null;
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
  workspaceCreatedAt?: string;
  clientMutationId: string;
  revisionId: string;
  itemId: string;
  projectId: string;
  towerId: string;
  leg?: string | null;
  assignedFlag?: string | null;
  rectificationComment: string;
  status: RevisionItemStatus;
  afterPhotos: LocalQualityPhoto[];
};

export async function enqueueDefectCreate(
  input: Omit<OfflineDefectCreate, "clientMutationId">,
) {
  const clientMutationId = mutationId("defect");

  await enqueue(
    "quality_defect_create",
    { ...input, clientMutationId },
    clientMutationId,
  );

  return clientMutationId;
}

export async function enqueueRevisionCreate(
  input: Omit<
    OfflineRevisionCreate,
    "clientMutationId" | "findings" | "firstFinding"
  > & {
    clientMutationId?: string;
    findings?: (Omit<OfflineRevisionCreate["findings"][number], "clientMutationId"> & {
        clientMutationId?: string;
      })[];
  },
) {
  const clientMutationId =
    input.clientMutationId || mutationId("revision");

  const findings = (input.findings ?? []).map((finding) => ({
    ...finding,
    clientMutationId:
      finding.clientMutationId || mutationId("revision-item"),
  }));

  await enqueue(
    "quality_revision_create",
    {
      ...input,
      clientMutationId,
      findings,
    },
    clientMutationId,
  );

  return clientMutationId;
}

export async function enqueueRevisionItemCreate(
  input: Omit<
    OfflineRevisionItemCreate,
    "clientMutationId"
  > & {
    clientMutationId?: string;
  },
) {
  const clientMutationId =
    input.clientMutationId || mutationId("revision-item");

  await enqueue(
    "quality_revision_item_create",
    {
      ...input,
      clientMutationId,
    },
    clientMutationId,
  );

  return clientMutationId;
}

export async function enqueueRevisionItemUpdate(
  input: Omit<OfflineRevisionItemUpdate, "clientMutationId"> & { clientMutationId?: string },
) {
  const clientMutationId = input.clientMutationId || mutationId("revision-rectification");

  await enqueue(
    "quality_revision_item_update",
    {
      ...input,
      clientMutationId,
    },
    clientMutationId,
  );

  return clientMutationId;
}

export async function cleanupQualityPhotos(
  photos: LocalQualityPhoto[],
) {
  for (const photo of photos) {
    await removeOfflineFile(photo.uri);
  }
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
  role:
    | "defect_photo"
    | "before_photo"
    | "after_photo";
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
      clientMutationId: photo.id,
      watermarkPosition: photo.watermarkPosition,
    });
  }

  // Cleanup happens only after the whole operation and workspace reconciliation.
}

async function syncDefect(
  payload: OfflineDefectCreate,
) {
  const result = await apiJson<{
    defect: { id: string };
  }>(
    "/api/mobile/quality/defects",
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        photos: undefined,
      }),
    },
  );

  await uploadPhotos({
    projectId: payload.projectId,
    towerId: payload.towerId,
    defectId: result.defect.id,
    role: "defect_photo",
    photos: payload.photos,
  });
}

async function createRevisionItem(
  payload: OfflineRevisionItemCreate,
) {
  const result = await apiJson<{
    item: { id: string };
  }>(
    `/api/mobile/quality/revisions/${encodeURIComponent(payload.revisionId)}/items`,
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        beforePhotos: undefined,
        afterPhotos: undefined,
      }),
    },
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
  if (payload.status === "Rectified") await apiJson(`/api/mobile/quality/revisions/${encodeURIComponent(payload.revisionId)}/items/${encodeURIComponent(result.item.id)}`, { method: "PATCH", body: JSON.stringify({ status: "Rectified", rectificationComment: payload.rectificationComment }) });

}

async function syncRevision(
  payload: OfflineRevisionCreate,
) {
  const result = await apiJson<{
    revision: { id: string };
  }>(
    "/api/mobile/quality/revisions",
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        findings: undefined,
        firstFinding: undefined,
      }),
    },
  );

  const workspaces = await listRevisionWorkspaces(payload.projectId);
  for (const workspace of workspaces.filter(row => row.clientMutationId === payload.clientMutationId)) {
    await saveRevisionWorkspace({ ...workspace, serverRevisionId: result.revision.id });
  }
  const findings =
    payload.findings?.length
      ? payload.findings
      : payload.firstFinding
        ? [payload.firstFinding]
        : [];

  for (const finding of findings) {
    await createRevisionItem({
      ...finding,
      revisionId: result.revision.id,
      projectId: payload.projectId,
      towerId: payload.towerId,
    });
  }
}

async function syncRevisionItemUpdate(
  payload: OfflineRevisionItemUpdate,
) {
  await apiJson(`/api/mobile/quality/revisions/${encodeURIComponent(payload.revisionId)}/items/${encodeURIComponent(payload.itemId)}`, { method: "PATCH", body: JSON.stringify({ leg: payload.leg, assignedFlag: payload.assignedFlag, rectificationComment: payload.rectificationComment }) });
  await uploadPhotos({
    projectId: payload.projectId,
    towerId: payload.towerId,
    revisionId: payload.revisionId,
    revisionItemId: payload.itemId,
    role: "after_photo",
    photos: payload.afterPhotos,
  });
  await apiJson<{ item: { id: string } }>(
    `/api/mobile/quality/revisions/${encodeURIComponent(payload.revisionId)}/items/${encodeURIComponent(payload.itemId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        leg: payload.leg, assignedFlag: payload.assignedFlag,
        rectificationComment:
          payload.rectificationComment,
        status: payload.status,
      }),
    },
  );


}

export async function syncQualityQueueRecord(record: QueueRecord) {
  const payload = { ...(record.payload as OfflineRevisionItemCreate & OfflineRevisionItemUpdate) };
  const workspaces = await listRevisionWorkspaces(payload.projectId);
  const workspace = workspaces.find(row => row.routeKey === payload.revisionId || row.serverRevisionId === payload.revisionId || row.clientMutationId === payload.clientMutationId);
  if (payload.revisionId?.startsWith("local-")) {
    if (!workspace?.serverRevisionId) throw new Error("Parent Revision must sync before its findings.");
    payload.revisionId = workspace.serverRevisionId;
  }
  if (record.kind === "quality_revision_finalise") {
    const dependencies = (await queueRows()).filter(row => row.id !== record.id && row.kind.startsWith("quality_") && ((row.payload as { revisionId?: string }).revisionId === (record.payload as { revisionId: string }).revisionId || (workspace?.clientMutationId && (row.payload as { clientMutationId?: string }).clientMutationId === workspace.clientMutationId)));
    if (dependencies.length || workspace?.findings.length || workspace?.pendingUpdates.length) throw new Error("Finalisation is waiting for all findings and evidence to sync.");
    const result = await apiJson<{ revision: { finalised_at: string } }>(`/api/quality/revisions/${encodeURIComponent(payload.revisionId)}/finalise`, { method: "POST" });
    if (workspace) await saveRevisionWorkspace({ ...workspace, finalisedAt: result.revision.finalised_at, finaliseRequested: false });
    return;
  }
  if (record.kind === "quality_defect_create") await syncDefect(record.payload as OfflineDefectCreate);
  else if (record.kind === "quality_revision_create") { await syncRevision(record.payload as OfflineRevisionCreate); return; }
  else if (record.kind === "quality_revision_item_create") await createRevisionItem(payload);
  else if (record.kind === "quality_revision_item_update") await syncRevisionItemUpdate(payload);
  else throw new Error(`Unsupported Quality queue item: ${record.kind}`);
  if (workspace) await saveRevisionWorkspace({ ...workspace,
    reconciledFindingIds: [...(workspace.reconciledFindingIds || []), payload.clientMutationId],
    reconciledUpdateKeys: [...(workspace.reconciledUpdateKeys || []), ...workspace.pendingUpdates.filter(row => row.itemId === payload.itemId && (!payload.workspaceCreatedAt || row.createdAt === payload.workspaceCreatedAt)).map(row => `${row.itemId}:${row.createdAt}`)],
    findings: workspace.findings.filter(row => row.clientMutationId !== payload.clientMutationId),
    pendingUpdates: workspace.pendingUpdates.filter(row => row.itemId !== payload.itemId || (payload.workspaceCreatedAt && row.createdAt !== payload.workspaceCreatedAt)),
  });
  // Files are cleaned by SyncContext only after queue deletion succeeds.
}
export async function cleanupQualityRecord(record: QueueRecord) {
  const photos: LocalQualityPhoto[] = [];
  function collect(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(collect); return; }
    const row = value as Record<string, unknown>;
    if (typeof row.uri === "string" && typeof row.mimeType === "string") photos.push(row as LocalQualityPhoto);
    else Object.values(row).forEach(collect);
  }
  collect(record.payload);
  const referenced = new Set<string>();
  const findReferences = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(findReferences); return; }
    const row = value as Record<string, unknown>;
    if (typeof row.uri === "string") referenced.add(row.uri);
    else Object.values(row).forEach(findReferences);
  };
  (await queueRows()).forEach(row => findReferences(row.payload));
  await cleanupQualityPhotos(photos.filter(photo => !referenced.has(photo.uri)));
}
