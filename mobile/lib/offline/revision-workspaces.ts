import type { DetailValues } from "../../../lib/quality/operational-details";
import { withoutDeletedPhotos } from "./quality-photo-tombstones";

import { getCache, setCache } from "@/lib/offline/db";
import type { RevisionWorkingLocation } from "./revision-location";
import { revisionDeletion } from "./revision-deletions";
import type {
  InspectionStage,
  LocalQualityPhoto,
  RevisionItemStatus,
  QualityRevisionDetailPayload,
} from "@/types/quality";

export type PendingRevisionFinding = {
  operationalDetails?: DetailValues;
  clientMutationId: string;
  queuedAt: string | null;
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
  createdAt: string;
};

export type PendingRevisionUpdate = {
  expectedVersion?: number;
  itemId: string;
  leg?: string | null;
  assignedFlag?: string | null;
  rectificationComment: string;
  status: RevisionItemStatus;
  afterPhotos: LocalQualityPhoto[];
  queuedAt: string | null;
  createdAt: string;
};

export type RevisionWorkspace = {
  additionalRectConfirmed?: boolean;
  towerLabel?:string|null;
  workingLocation?: RevisionWorkingLocation;
  legacyRouteKeys?:string[];
  syncedAt?:string|null;
  reconciliationStatus?:"pending"|"synced";
  cachedDetail?:QualityRevisionDetailPayload;
  serverItems?: Record<string, { id: string; fli_number: string | null; item_number?: number | null }>;
  reconciledFindingIds?: string[];
  reconciledUpdateKeys?: string[];
  finaliseRequested?: boolean;
  finalisedAt?: string | null;
  routeKey: string;
  projectId: string;
  towerId: string;
  clientMutationId: string | null;
  serverRevisionNumber?: string | null;
  serverRevisionId: string | null;
  inspectionStage: InspectionStage;
  inspectionDate: string;
  clientInspector: string | null;
  clientCompany: string | null;
  clientReference: string | null;
  notes: string | null;
  parentQueuedAt: string | null;
  findings: PendingRevisionFinding[];
  pendingUpdates: PendingRevisionUpdate[];
  createdAt: string;
  updatedAt: string;
};

function key(projectId: string) {
  return `quality:revision-workspaces:${projectId}`;
}

export function localRevisionRouteKey(clientMutationId: string) {
  return `local-${clientMutationId}`;
}

export function isLocalRevisionRouteKey(value: string) {
  return value.startsWith("local-");
}

export function clientMutationIdFromRouteKey(value: string) {
  return isLocalRevisionRouteKey(value) ? value.slice("local-".length) : null;
}

export async function listRevisionWorkspaces(projectId: string) {
  const cached = await getCache<RevisionWorkspace[]>(key(projectId));
  return withoutDeletedPhotos(cached?.value ?? []);
}

let workspaceWrite: Promise<unknown> = Promise.resolve();
export function saveRevisionWorkspace(workspace: RevisionWorkspace): Promise<RevisionWorkspace> {
  const task = workspaceWrite.catch(() => undefined).then(async () => {
    if(await revisionDeletion(workspace.projectId,workspace.routeKey,workspace.serverRevisionId,workspace.clientMutationId)) throw new Error("This Rectification is deleted or pending deletion. Its changes cannot be synced.");
    const current = await listRevisionWorkspaces(workspace.projectId);
    const previous = current.find(row => row.routeKey === workspace.routeKey);
    const reconciledFindingIds = [...new Set([...(previous?.reconciledFindingIds || []), ...(workspace.reconciledFindingIds || [])])];
    const reconciledUpdateKeys = [...new Set([...(previous?.reconciledUpdateKeys || []), ...(workspace.reconciledUpdateKeys || [])])];
    const workingLocation=(previous?.workingLocation?.updatedAt || "") > (workspace.workingLocation?.updatedAt || "") ? previous?.workingLocation : workspace.workingLocation || previous?.workingLocation;
    const next = { ...workspace, workingLocation, cachedDetail: workspace.cachedDetail || previous?.cachedDetail, syncedAt: workspace.syncedAt || previous?.syncedAt, reconciliationStatus: workspace.reconciliationStatus || previous?.reconciliationStatus, legacyRouteKeys: [...new Set([...(previous?.legacyRouteKeys || []), ...(workspace.legacyRouteKeys || [])])], serverRevisionNumber: workspace.serverRevisionNumber || previous?.serverRevisionNumber || null, serverItems: { ...previous?.serverItems, ...workspace.serverItems }, serverRevisionId: workspace.serverRevisionId || previous?.serverRevisionId || null, reconciledFindingIds, reconciledUpdateKeys,
      findings: [...new Map([...(previous?.findings || []), ...workspace.findings].map(row => [row.clientMutationId, row])).values()].filter(row => !reconciledFindingIds.includes(row.clientMutationId)),
      pendingUpdates: [...new Map([...(previous?.pendingUpdates || []), ...workspace.pendingUpdates].map(row => [`${row.itemId}:${row.createdAt}`, row])).values()].filter(row => !reconciledUpdateKeys.includes(`${row.itemId}:${row.createdAt}`)),
    };
    const filtered=await withoutDeletedPhotos(next);
    await setCache(key(workspace.projectId), [filtered, ...current.filter(row => row.routeKey !== workspace.routeKey)]);
    return filtered;
  });
  workspaceWrite = task;
  return task;
}

export async function removeRevisionWorkspace(
  projectId: string,
  routeKey: string,
) {
  const task=workspaceWrite.catch(()=>undefined).then(async()=>{
    const current=await listRevisionWorkspaces(projectId);
    await setCache(key(projectId),current.filter(row=>row.routeKey!==routeKey));
  });
  workspaceWrite=task;await task;
}

export async function ensureServerRevisionWorkspace(input: {
  projectId: string;
  revisionId: string;
  revisionNumber?: string | null;
  towerId: string;
  inspectionStage: InspectionStage;
  inspectionDate: string;
  clientInspector?: string | null;
  clientCompany?: string | null;
  clientReference?: string | null;
  notes?: string | null;
}) {
  const current = await listRevisionWorkspaces(input.projectId);
  const existing = current.find(
    (row) =>
      row.routeKey === input.revisionId ||
      row.serverRevisionId === input.revisionId,
  );

  if (existing) return input.revisionNumber && existing.serverRevisionNumber !== input.revisionNumber ? saveRevisionWorkspace({ ...existing, serverRevisionNumber: input.revisionNumber }) : existing;

  const now = new Date().toISOString();
  const workspace: RevisionWorkspace = {
    routeKey: input.revisionId,
    projectId: input.projectId,
    towerId: input.towerId,
    clientMutationId: null,
    serverRevisionId: input.revisionId,
    serverRevisionNumber: input.revisionNumber,
    inspectionStage: input.inspectionStage,
    inspectionDate: input.inspectionDate,
    clientInspector: input.clientInspector ?? null,
    clientCompany: input.clientCompany ?? null,
    clientReference: input.clientReference ?? null,
    notes: input.notes ?? null,
    parentQueuedAt: now,
    findings: [],
    pendingUpdates: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveRevisionWorkspace(workspace);
  return workspace;
}

/** A confirmed server detail is a durable readable cache, never a delete signal. */
export async function reconcileRevisionDetail(projectId:string,detail:QualityRevisionDetailPayload,localRoute?:string) {
  const revision=detail.revision;
  const existing=(await listRevisionWorkspaces(projectId)).find(row=>row.serverRevisionId===revision.id || row.routeKey===revision.id || Boolean(revision.mobile_client_mutation_id && row.clientMutationId===revision.mobile_client_mutation_id));
  const base=existing || await ensureServerRevisionWorkspace({projectId,revisionId:revision.id,revisionNumber:revision.revision_number,towerId:revision.tower_id,inspectionStage:revision.inspection_stage,inspectionDate:revision.inspection_date,notes:revision.notes,clientInspector:revision.client_inspector,clientCompany:revision.client_company,clientReference:revision.client_reference});
  return saveRevisionWorkspace({...base,towerLabel:(detail.towerLabel && detail.towerLabel!=="Deleted tower"?detail.towerLabel:base.towerLabel) || detail.towerLabel,legacyRouteKeys:[...new Set([...(base.legacyRouteKeys || []),...(localRoute?[localRoute]:[])])],clientMutationId:revision.mobile_client_mutation_id || base.clientMutationId,serverRevisionId:revision.id,serverRevisionNumber:revision.revision_number,cachedDetail:detail,syncedAt:new Date().toISOString(),reconciliationStatus:base.findings.length || base.pendingUpdates.length?"pending":"synced"});
}

export function createLocalRevisionWorkspace(input: {
  additionalRectConfirmed?: boolean;
  projectId: string;
  towerId: string;
  clientMutationId: string;
  inspectionStage: InspectionStage;
  inspectionDate: string;
  clientInspector?: string | null;
  clientCompany?: string | null;
  clientReference?: string | null;
  notes?: string | null;
}) {
  const now = new Date().toISOString();
  return {
    additionalRectConfirmed: input.additionalRectConfirmed,
    routeKey: localRevisionRouteKey(input.clientMutationId),
    projectId: input.projectId,
    towerId: input.towerId,
    clientMutationId: input.clientMutationId,
    serverRevisionId: null,
    inspectionStage: input.inspectionStage,
    inspectionDate: input.inspectionDate,
    clientInspector: input.clientInspector ?? null,
    clientCompany: input.clientCompany ?? null,
    clientReference: input.clientReference ?? null,
    notes: input.notes ?? null,
    parentQueuedAt: now,
    findings: [],
    pendingUpdates: [],
    createdAt: now,
    updatedAt: now,
  } satisfies RevisionWorkspace;
}

export function createPendingFinding(input: {
  operationalDetails?: DetailValues;
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
}) {
  const clientMutationId = `revision-item-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;

  return {
    clientMutationId,
    queuedAt: null,
    ...input,
    createdAt: new Date().toISOString(),
  } satisfies PendingRevisionFinding;
}

export function touchWorkspace(workspace: RevisionWorkspace) {
  return {
    ...workspace,
    updatedAt: new Date().toISOString(),
  };
}
