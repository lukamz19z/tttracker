
import { getCache, setCache } from "@/lib/offline/db";
import type {
  InspectionStage,
  LocalQualityPhoto,
  RevisionItemStatus,
} from "@/types/quality";

export type PendingRevisionFinding = {
  clientMutationId: string;
  queuedAt: string | null;
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
  itemId: string;
  rectificationComment: string;
  status: RevisionItemStatus;
  afterPhotos: LocalQualityPhoto[];
  queuedAt: string | null;
  createdAt: string;
};

export type RevisionWorkspace = {
  routeKey: string;
  projectId: string;
  towerId: string;
  clientMutationId: string | null;
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
  return cached?.value ?? [];
}

export async function saveRevisionWorkspace(
  workspace: RevisionWorkspace,
) {
  const current = await listRevisionWorkspaces(workspace.projectId);
  const next = [
    workspace,
    ...current.filter((row) => row.routeKey !== workspace.routeKey),
  ];
  await setCache(key(workspace.projectId), next);
  return workspace;
}

export async function removeRevisionWorkspace(
  projectId: string,
  routeKey: string,
) {
  const current = await listRevisionWorkspaces(projectId);
  await setCache(
    key(projectId),
    current.filter((row) => row.routeKey !== routeKey),
  );
}

export async function ensureServerRevisionWorkspace(input: {
  projectId: string;
  revisionId: string;
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

  if (existing) return existing;

  const now = new Date().toISOString();
  const workspace: RevisionWorkspace = {
    routeKey: input.revisionId,
    projectId: input.projectId,
    towerId: input.towerId,
    clientMutationId: null,
    serverRevisionId: input.revisionId,
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

export function createLocalRevisionWorkspace(input: {
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
