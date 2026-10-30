import type { DetailValues } from "../../../lib/quality/operational-details";
import { syncQualityPhotoDelete } from "./quality-photo-deletion";
import { photoDeleted, withoutDeletedPhotos } from "./quality-photo-tombstones";
import { annotateQualityPhoto, photoContext, persistEvidencePhoto } from "@/lib/quality-evidence";
import { DependencyBlockedError } from "./sync-errors";
import { withQualityOperation } from "./quality-operation-lock";
import { revisionDeletion } from "./revision-deletions";
import { listRevisionWorkspaces, saveRevisionWorkspace } from "./revision-workspaces";
import { queueRows, getCache, setCache,removeCache } from "./db";
import { apiJson } from "@/lib/api/client";
import { enqueue, type QueueRecord } from "@/lib/offline/db";
import { removeOfflineFile, offlineFileExists } from "@/lib/offline/files";
import { uploadQualityPhoto, refreshQualityRevisionDetail, refreshQualityDefectDetail, updateDefect } from "@/lib/api/quality";
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
export type OfflineDefectUpdate = {projectId:string;towerId:string;defectId:string;photos:LocalQualityPhoto[];patch?:Parameters<typeof updateDefect>[1]};
export async function enqueueDefectUpdate(input:OfflineDefectUpdate) {
  return enqueue("quality_defect_update",{...input,photos:await Promise.all(input.photos.map(photo=>annotateQualityPhoto(photo,photoContext({...photo.watermarkContext,kind:"defect"},String(photo.watermarkContext?.phase || "AFTER"),photo.capturedAt))))});
}

export type OfflineRevisionCreate = {
  additionalRectConfirmed?: boolean;
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
  operationalDetails?: DetailValues;
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
  operationalDetails?: DetailValues;
  issueTypeId?: string | null;
  beforePhotos?: LocalQualityPhoto[];
  expectedVersion?: number;
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
    { ...input, photos: await Promise.all(input.photos.map(photo=>annotateQualityPhoto(photo,photoContext({...photo.watermarkContext,kind:"defect"},"BEFORE",photo.capturedAt)))), clientMutationId },
    clientMutationId,
  );

  return clientMutationId;
}

async function enqueueRectOperation<T extends {projectId:string;revisionId?:string;clientMutationId?:string}>(kind:string,payload:T,id:string) {
  return withQualityOperation(async()=>{
    if(await revisionDeletion(payload.projectId,payload.revisionId,payload.clientMutationId))return;
    if(kind==="quality_revision_item_create" && (await listRevisionWorkspaces(payload.projectId)).some(row=>(row.routeKey===payload.revisionId || row.serverRevisionId===payload.revisionId) && row.reconciledFindingIds?.includes(payload.clientMutationId || "")))return;
    await enqueue(kind,payload,id);
  });
}

async function prepareEvidence(photos: LocalQualityPhoto[], phase: "BEFORE" | "AFTER") {
  return Promise.all(photos.map(photo => annotateQualityPhoto(photo,photoContext(photo.watermarkContext || {},phase,photo.capturedAt))));
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

  const findings = await Promise.all((input.findings ?? []).map(async (finding) => ({
    ...finding,
    clientMutationId:
      finding.clientMutationId || mutationId("revision-item"),
    beforePhotos: await prepareEvidence(finding.beforePhotos,"BEFORE"), afterPhotos: await prepareEvidence(finding.afterPhotos,"AFTER"),
  })));

  await enqueueRectOperation("quality_revision_create",
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

  await enqueueRectOperation("quality_revision_item_create",
    {
      ...input,
      beforePhotos: await prepareEvidence(input.beforePhotos,"BEFORE"), afterPhotos: await prepareEvidence(input.afterPhotos,"AFTER"),
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

  await enqueueRectOperation("quality_revision_item_update",
    {
      ...input,
      beforePhotos: await prepareEvidence(input.beforePhotos || [],"BEFORE"),
      afterPhotos: await prepareEvidence(input.afterPhotos,"AFTER"),
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
    await removeOfflineFile(photo.originalUri || photo.uri);
    await removeOfflineFile(photo.annotatedUri);
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
  if (!photos.length) return;
  let context: Record<string,unknown> | null = null;
  if (revisionId && revisionItemId) {
    const response = await apiJson<{ evidenceContext: Record<string,unknown> }>(`/api/mobile/quality/revisions/${encodeURIComponent(revisionId)}/items/${encodeURIComponent(revisionItemId)}`, {
      qualityDiagnostic: { operation: "quality_evidence_context", stage: role, clientMutationId: photos[0]?.id },
    });
    context = response.evidenceContext;
  } else if(defectId) {
    const response=await apiJson<{evidenceContext:Record<string,unknown>}>(`/api/mobile/quality/details/defects/${encodeURIComponent(defectId)}?projectId=${encodeURIComponent(projectId)}`);
    context=response.evidenceContext;
  }
  for (const photo of photos) {
    if(await photoDeleted(photo.id))continue;
    const receiptKey = `quality:evidence-receipt:${projectId}:${revisionItemId || defectId}:${role}:${photo.id}`;
    if (await getCache<{ id: string }>(receiptKey)) continue;
    if (context) Object.assign(photo,await annotateQualityPhoto(photo,photoContext(context,role === "after_photo" || photo.watermarkContext?.phase === "AFTER" ? "AFTER" : "BEFORE",photo.capturedAt)));
    if (context) await persistEvidencePhoto(projectId,photo);
    if (!offlineFileExists(photo.originalUri || photo.uri)) throw new Error("Local evidence file could not be found.");
    if (__DEV__) console.debug("Quality sync stage", { stage: role, clientMutationId: photo.id, serverRevisionId: revisionId, serverItemId: revisionItemId });
    const uploaded = await uploadQualityPhoto({
      projectId,
      towerId,
      revisionId,
      revisionItemId,
      defectId,
      fileRole: role,
      uri: photo.originalUri || photo.uri,
      annotatedUri: photo.annotatedUri,
      name: photo.name,
      mimeType: photo.mimeType,
      capturedAt: photo.capturedAt,
      clientMutationId: photo.id,
      watermarkPosition: photo.watermarkPosition,
      evidencePhase: String(photo.watermarkContext?.phase || "BEFORE"),
    });
    if (!uploaded.file?.id) throw new Error("Evidence upload returned no server file ID.");
    await setCache(receiptKey, uploaded.file);
    await setCache(`quality:photo-server:${photo.id}`,{...uploaded.file,project_id:projectId,revision_id:revisionId,revision_item_id:revisionItemId});
  }

  // Cleanup happens only after the whole operation and workspace reconciliation.
}

async function syncDefect(
  payload: OfflineDefectCreate,
) {
  const known=(await getCache<{id:string}>(`quality:defect-mapping:${payload.projectId}:${payload.clientMutationId}`))?.value;
  const result = known ? {defect:known} : await apiJson<{
    defect: { id: string };
  }>(
    "/api/mobile/quality/defects",
    {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        source:"mobile",
        photos: undefined,
      }),
    },
  );
  if(!result.defect?.id) throw new Error("Defect create did not return its server ID.");
  await setCache(`quality:defect-mapping:${payload.projectId}:${payload.clientMutationId}`,result.defect);
  await uploadPhotos({
    projectId: payload.projectId,
    towerId: payload.towerId,
    defectId: result.defect.id,
    role: "defect_photo",
    photos: payload.photos,
  });
  try { await refreshQualityDefectDetail(payload.projectId,result.defect.id); }
  catch (error) { if (__DEV__) console.warn("Defect synced; cached mapping retained",error instanceof Error?error.message:"Detail refresh deferred"); }
}

async function createRevisionItem(
  payload: OfflineRevisionItemCreate,
) {
  const workspaces = await listRevisionWorkspaces(payload.projectId);
  if(workspaces.some(row=>(row.serverRevisionId===payload.revisionId || row.routeKey===payload.revisionId) && row.reconciledFindingIds?.includes(payload.clientMutationId)))return;
  const known = workspaces.find(row => row.serverRevisionId === payload.revisionId || row.routeKey === payload.revisionId)?.serverItems?.[payload.clientMutationId] || (await getCache<{ id: string; fli_number: string | null; item_number?: number | null }>(`quality:item-mapping:${payload.projectId}:${payload.clientMutationId}`))?.value;
  const result = known ? { item: known } : await apiJson<{
    item: { id: string; fli_number: string | null; item_number?: number | null };
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

  if (!result.item?.id || !result.item.fli_number || !result.item.item_number) throw new Error("Finding creation returned no canonical server FLI.");
  await setCache(`quality:item-mapping:${payload.projectId}:${payload.clientMutationId}`, result.item);
  // Commit mapping before evidence: retries after a crash reuse this exact FLI.
  for (const workspace of await listRevisionWorkspaces(payload.projectId)) {
    if (workspace.serverRevisionId === payload.revisionId || workspace.routeKey === payload.revisionId) {
      await saveRevisionWorkspace({ ...workspace, serverItems: { ...workspace.serverItems, [payload.clientMutationId]: result.item } });
    }
  }
  if (__DEV__) console.debug("Quality sync stage", { stage: "finding-mapped-before-evidence", clientMutationId: payload.clientMutationId, serverRevisionId: payload.revisionId, serverItemId: result.item.id, fli: result.item.fli_number });
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
  if (payload.status === "Rectified") await apiJson(`/api/mobile/quality/revisions/${encodeURIComponent(payload.revisionId)}/items/${encodeURIComponent(result.item.id)}`, { method: "PATCH", body: JSON.stringify({ expectedVersion: 1, clientMutationId: `${payload.clientMutationId}:complete`, status: "Rectified", rectificationComment: payload.rectificationComment }) });

}

async function syncRevision(
  payload: OfflineRevisionCreate,
) {
  const existingWorkspace = (await listRevisionWorkspaces(payload.projectId)).find(row => row.clientMutationId === payload.clientMutationId);
  const cachedParent = (await getCache<{ id: string; revision_number?: string | null }>(`quality:parent-mapping:${payload.projectId}:${payload.clientMutationId}`))?.value;
  const result = existingWorkspace?.serverRevisionId ? { revision: { id: existingWorkspace.serverRevisionId, revision_number: existingWorkspace.serverRevisionNumber } } : cachedParent ? { revision: cachedParent } : await apiJson<{
    revision: { id: string; revision_number?: string | null };
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

  if (!result.revision?.id) throw new Error("Revision creation returned no server ID.");
  await setCache(`quality:parent-mapping:${payload.projectId}:${payload.clientMutationId}`, result.revision);
  const workspaces = await listRevisionWorkspaces(payload.projectId);
  for (const workspace of workspaces.filter(row => row.clientMutationId === payload.clientMutationId)) {
    await saveRevisionWorkspace({ ...workspace, serverRevisionId: result.revision.id, serverRevisionNumber: result.revision.revision_number });
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
  // Save details with the version captured by the editor, never a freshly fetched version.
  // Stable command IDs make both phases safe after an uncertain network response.
  const endpoint=`/api/mobile/quality/revisions/${encodeURIComponent(payload.revisionId)}/items/${encodeURIComponent(payload.itemId)}`;
  const details=await apiJson<{item:{record_version:number}}>(endpoint,{method:"PATCH",body:JSON.stringify({
    expectedVersion:payload.expectedVersion,clientMutationId:`${payload.clientMutationId}:details`,
    leg:payload.leg,assignedFlag:payload.assignedFlag,rectificationComment:payload.rectificationComment,
    operationalDetails:payload.operationalDetails,issueTypeId:payload.issueTypeId,
  })});
  await uploadPhotos({projectId:payload.projectId,towerId:payload.towerId,revisionId:payload.revisionId,revisionItemId:payload.itemId,role:"before_photo",photos:payload.beforePhotos || []});
  await uploadPhotos({projectId:payload.projectId,towerId:payload.towerId,revisionId:payload.revisionId,revisionItemId:payload.itemId,role:"after_photo",photos:payload.afterPhotos});
  await apiJson(endpoint,{method:"PATCH",body:JSON.stringify({expectedVersion:details.item.record_version,clientMutationId:`${payload.clientMutationId}:status`,status:payload.status})});

}

async function applyQualityQueueRecord(record: QueueRecord) {
  if(record.kind==="quality_evidence_delete"){await syncQualityPhotoDelete(record.payload as {fileId:string});return;}
  record={...record,payload:await withoutDeletedPhotos(record.payload)};
  const payload = { ...(record.payload as OfflineRevisionItemCreate & OfflineRevisionItemUpdate) };
  const workspaces = await listRevisionWorkspaces(payload.projectId);
  const workspace = workspaces.find(row => row.routeKey === payload.revisionId || row.serverRevisionId === payload.revisionId || row.clientMutationId === payload.clientMutationId);
  const mappedItem = workspace?.serverItems?.[payload.itemId] || (payload.itemId ? (await getCache<{ id: string }>(`quality:item-mapping:${payload.projectId}:${payload.itemId}`))?.value : null);
  if (mappedItem) payload.itemId = mappedItem.id;
  if (payload.itemId?.startsWith("revision-item-") && !mappedItem) throw new DependencyBlockedError("Finding must sync before its rectification.");
  if (payload.revisionId?.startsWith("local-")) {
    if (!workspace?.serverRevisionId) throw new DependencyBlockedError("Parent Revision must sync before its findings.");
    payload.revisionId = workspace.serverRevisionId;
  }
  if (record.kind === "quality_revision_item_update") {
    const dependencies = await queueRows();
    if (dependencies.some(row => row.kind === "quality_revision_item_create" &&
      ((row.payload as OfflineRevisionItemCreate).clientMutationId === (record.payload as OfflineRevisionItemUpdate).itemId ||
       workspace?.serverItems?.[(row.payload as OfflineRevisionItemCreate).clientMutationId]?.id === payload.itemId))) {
      throw new DependencyBlockedError("Finding and Before evidence must sync before its rectification.");
    }
  }
  if (record.kind === "quality_revision_finalise") {
    const dependencies = (await queueRows()).filter(row => row.id !== record.id && row.kind.startsWith("quality_") && ((row.payload as { revisionId?: string }).revisionId === (record.payload as { revisionId: string }).revisionId || (workspace?.clientMutationId && (row.payload as { clientMutationId?: string }).clientMutationId === workspace.clientMutationId)));
    if (dependencies.length || workspace?.findings.length || workspace?.pendingUpdates.length) throw new DependencyBlockedError("Finalisation is waiting for all findings and evidence to sync.");
    const result = await apiJson<{ revision: { finalised_at: string } }>(`/api/quality/revisions/${encodeURIComponent(payload.revisionId)}/finalise`, { method: "POST" });
    if (workspace) await saveRevisionWorkspace({ ...workspace, finalisedAt: result.revision.finalised_at, finaliseRequested: false });
    return;
  }
  if (record.kind === "quality_defect_update") {
    const update=record.payload as OfflineDefectUpdate;
    await uploadPhotos({...update,role:"defect_photo"});
    if(update.patch) await apiJson(`/api/quality/defects/${encodeURIComponent(update.defectId)}`,{method:"PATCH",body:JSON.stringify(update.patch)});
  }
  else if (record.kind === "quality_defect_create") await syncDefect(record.payload as OfflineDefectCreate);
  else if (record.kind === "quality_revision_create") { await syncRevision(record.payload as OfflineRevisionCreate); return; }
  else if (record.kind === "quality_revision_item_create") await createRevisionItem(payload);
  else if (record.kind === "quality_revision_item_update") await syncRevisionItemUpdate(payload);
  else throw new Error(`Unsupported Quality queue item: ${record.kind}`);
  if (workspace) await saveRevisionWorkspace({ ...workspace,
    reconciledFindingIds: [...(workspace.reconciledFindingIds || []), payload.clientMutationId],
    reconciledUpdateKeys: [...(workspace.reconciledUpdateKeys || []), ...workspace.pendingUpdates.filter(row => row.itemId === (record.payload as OfflineRevisionItemUpdate).itemId && (!payload.workspaceCreatedAt || row.createdAt === payload.workspaceCreatedAt)).map(row => `${row.itemId}:${row.createdAt}`)],
    findings: workspace.findings.filter(row => row.clientMutationId !== payload.clientMutationId),
    pendingUpdates: workspace.pendingUpdates.filter(row => row.itemId !== (record.payload as OfflineRevisionItemUpdate).itemId || (payload.workspaceCreatedAt && row.createdAt !== payload.workspaceCreatedAt)),
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
  const projectId=(record.payload as {projectId?:string}).projectId;
  if(projectId) (await listRevisionWorkspaces(projectId)).forEach(row=>findReferences([row.findings,row.pendingUpdates]));
  const removable=photos.filter(photo=>!referenced.has(photo.uri));
  for(const photo of removable) {
    const cached=(await getCache<LocalQualityPhoto>(`quality:photo-annotation:${photo.id}`))?.value;
    if(cached) await cleanupQualityPhotos([cached]);
    await removeCache(`quality:photo-annotation:${photo.id}`);
  }
  await cleanupQualityPhotos(removable);
}

export async function syncQualityQueueRecord(record: QueueRecord) {
  return withQualityOperation(()=>syncQualityRecord(record));
}
async function syncQualityRecord(record:QueueRecord) {
  const payload = record.payload as Partial<OfflineRevisionItemUpdate>;
  const startedAt = Date.now();
  const workspace = (await listRevisionWorkspaces(payload.projectId || "")).find(row => row.routeKey === payload.revisionId || row.serverRevisionId === payload.revisionId || row.clientMutationId === payload.clientMutationId);
  if(payload.projectId && await revisionDeletion(payload.projectId,payload.revisionId,payload.clientMutationId,workspace?.routeKey,workspace?.serverRevisionId,workspace?.clientMutationId))return;
  if(record.kind==="quality_revision_item_create" && workspace?.reconciledFindingIds?.includes(payload.clientMutationId || ""))return;
  const details = { operation: record.kind, clientMutationId: payload.clientMutationId || record.id, localRevisionId: payload.revisionId || workspace?.routeKey, serverRevisionId: workspace?.serverRevisionId, localItemId: payload.itemId, serverItemId: workspace?.serverItems?.[payload.itemId || payload.clientMutationId || ""]?.id, retryCount: record.attempts };
  if (__DEV__) console.debug("Quality sync operation", { ...details, stage: "start" });
  try {
    await applyQualityQueueRecord(record);
    const current = (await listRevisionWorkspaces(payload.projectId || "")).find(row => row.routeKey === payload.revisionId || row.serverRevisionId === payload.revisionId || row.clientMutationId === payload.clientMutationId);
    const revisionId = current?.serverRevisionId || payload.revisionId;
    if (payload.projectId && revisionId && !revisionId.startsWith("local-")) {
      try { await refreshQualityRevisionDetail(payload.projectId, revisionId); }
      catch (error) { if (__DEV__) console.warn("Quality sync confirmed; detail refresh deferred", error instanceof Error ? error.message : "Refresh unavailable"); }
    }
    if (__DEV__) console.debug("Quality sync operation", { ...details, stage: "complete", durationMs: Date.now() - startedAt });
  } catch (error) {
    if (__DEV__) console.warn("Quality sync operation", { ...details, stage: "failed", durationMs: Date.now() - startedAt, error: error instanceof Error ? error.message : "Quality sync failed" });
    throw error;
  }
}
