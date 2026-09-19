import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";

import { apiFetch, apiJson } from "@/lib/api/client";
import { getCache, setCache } from "@/lib/offline/db";
import type {
  DefectAssignee,
  DefectStatus,
  QualityDefect,
  QualityDefectDetailPayload,
  QualityDefectListRow,
  QualityListPage,
  QualityPayload,
  QualityRevision,
  QualityRevisionDetailPayload,
  QualityRevisionItem,
  QualityRevisionListRow,
  RevisionItemStatus,
  RevisionStatus,
} from "@/types/quality";

const QUALITY_CACHE_VERSION = 2;

export const qualityCacheKey = (projectId: string) =>
  `quality:v${QUALITY_CACHE_VERSION}:${projectId}`;

const legacyQualityCacheKey = (projectId: string) =>
  `quality:${projectId}`;

function slimPayload(value: QualityPayload): QualityPayload {
  return {
    ...value,
    payloadVersion: QUALITY_CACHE_VERSION,
    members: [],
    revisions: [],
    items: [],
    files: [],
    defects: [],
  };
}

export async function refreshQuality(projectId: string) {
  const data = await apiJson<QualityPayload>(
    `/api/mobile/quality/bootstrap?projectId=${encodeURIComponent(projectId)}`,
    { timeoutMs: 45_000 },
  );

  const slim = slimPayload(data);
  await setCache(qualityCacheKey(projectId), slim);
  return slim;
}

export async function cachedQuality(projectId: string) {
  const current = await getCache<QualityPayload>(
    qualityCacheKey(projectId),
  );
  if (current) return current;

  const legacy = await getCache<QualityPayload>(
    legacyQualityCacheKey(projectId),
  );
  if (!legacy) return null;

  const slim = slimPayload(legacy.value);
  await setCache(qualityCacheKey(projectId), slim);

  return {
    ...legacy,
    value: slim,
  };
}

type QualityListFilters = {
  towerId?: string;
  memberNumber?: string;
  issueTypeId?: string;
  inspectionStage?: string;
};

function listKey(
  kind: "defects" | "revisions",
  projectId: string,
  query: string,
  status: string,
  offset: number,
  filters: QualityListFilters = {},
) {
  const q = query.trim().toLowerCase().slice(0, 80);
  const tower = (filters.towerId ?? "").trim();
  const member = (filters.memberNumber ?? "").trim().toLowerCase();
  const issue = (filters.issueTypeId ?? "").trim();
  const stage = (filters.inspectionStage ?? "").trim().toLowerCase();

  return [
    "quality:list",
    kind,
    projectId,
    status,
    String(offset),
    encodeURIComponent(tower),
    encodeURIComponent(member),
    encodeURIComponent(issue),
    encodeURIComponent(stage),
    encodeURIComponent(q),
  ].join(":");
}

export async function listQualityDefects(input: {
  projectId: string;
  query?: string;
  status?: string;
  towerId?: string;
  memberNumber?: string;
  issueTypeId?: string;
  offset?: number;
  limit?: number;
}) {
  const query = input.query?.trim() ?? "";
  const status = input.status?.trim() || "All";
  const towerId = input.towerId?.trim() ?? "";
  const memberNumber = input.memberNumber?.trim() ?? "";
  const issueTypeId = input.issueTypeId?.trim() ?? "";
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.max(10, Math.min(50, input.limit ?? 25));

  const params = new URLSearchParams({
    projectId: input.projectId,
    q: query,
    status,
    towerId,
    memberNumber,
    issueTypeId,
    offset: String(offset),
    limit: String(limit),
  });

  const payload = await apiJson<
    QualityListPage<QualityDefectListRow>
  >(
    `/api/mobile/quality/lists/defects?${params.toString()}`,
    { timeoutMs: 30_000 },
  );

  await setCache(
    listKey(
      "defects",
      input.projectId,
      query,
      status,
      offset,
      { towerId, memberNumber, issueTypeId },
    ),
    payload,
  );

  return payload;
}

export function cachedQualityDefectList(input: {
  projectId: string;
  query?: string;
  status?: string;
  towerId?: string;
  memberNumber?: string;
  issueTypeId?: string;
  offset?: number;
}) {
  return getCache<QualityListPage<QualityDefectListRow>>(
    listKey(
      "defects",
      input.projectId,
      input.query ?? "",
      input.status ?? "All",
      Math.max(0, input.offset ?? 0),
      {
        towerId: input.towerId,
        memberNumber: input.memberNumber,
        issueTypeId: input.issueTypeId,
      },
    ),
  );
}

export async function listQualityRevisions(input: {
  projectId: string;
  query?: string;
  status?: string;
  towerId?: string;
  memberNumber?: string;
  inspectionStage?: string;
  offset?: number;
  limit?: number;
}) {
  const query = input.query?.trim() ?? "";
  const status = input.status?.trim() || "All";
  const towerId = input.towerId?.trim() ?? "";
  const memberNumber = input.memberNumber?.trim() ?? "";
  const inspectionStage = input.inspectionStage?.trim() ?? "";
  const offset = Math.max(0, input.offset ?? 0);
  const limit = Math.max(10, Math.min(50, input.limit ?? 25));

  const params = new URLSearchParams({
    projectId: input.projectId,
    q: query,
    status,
    towerId,
    memberNumber,
    inspectionStage,
    offset: String(offset),
    limit: String(limit),
  });

  const payload = await apiJson<
    QualityListPage<QualityRevisionListRow>
  >(
    `/api/mobile/quality/lists/revisions?${params.toString()}`,
    { timeoutMs: 30_000 },
  );

  await setCache(
    listKey(
      "revisions",
      input.projectId,
      query,
      status,
      offset,
      { towerId, memberNumber, inspectionStage },
    ),
    payload,
  );

  return payload;
}

export function cachedQualityRevisionList(input: {
  projectId: string;
  query?: string;
  status?: string;
  towerId?: string;
  memberNumber?: string;
  inspectionStage?: string;
  offset?: number;
}) {
  return getCache<QualityListPage<QualityRevisionListRow>>(
    listKey(
      "revisions",
      input.projectId,
      input.query ?? "",
      input.status ?? "All",
      Math.max(0, input.offset ?? 0),
      {
        towerId: input.towerId,
        memberNumber: input.memberNumber,
        inspectionStage: input.inspectionStage,
      },
    ),
  );
}

const defectDetailKey = (
  projectId: string,
  defectId: string,
) => `quality:defect:${projectId}:${defectId}`;

export async function refreshQualityDefectDetail(
  projectId: string,
  defectId: string,
) {
  const payload =
    await apiJson<QualityDefectDetailPayload>(
      `/api/mobile/quality/details/defects/${encodeURIComponent(defectId)}?projectId=${encodeURIComponent(projectId)}`,
      { timeoutMs: 30_000 },
    );

  await setCache(
    defectDetailKey(projectId, defectId),
    payload,
  );
  return payload;
}

export function cachedQualityDefectDetail(
  projectId: string,
  defectId: string,
) {
  return getCache<QualityDefectDetailPayload>(
    defectDetailKey(projectId, defectId),
  );
}

const revisionDetailKey = (
  projectId: string,
  revisionId: string,
) => `quality:revision:${projectId}:${revisionId}`;

export async function refreshQualityRevisionDetail(
  projectId: string,
  revisionId: string,
) {
  const payload =
    await apiJson<QualityRevisionDetailPayload>(
      `/api/mobile/quality/details/revisions/${encodeURIComponent(revisionId)}?projectId=${encodeURIComponent(projectId)}`,
      { timeoutMs: 30_000 },
    );

  await setCache(
    revisionDetailKey(projectId, revisionId),
    payload,
  );
  return payload;
}

export function cachedQualityRevisionDetail(
  projectId: string,
  revisionId: string,
) {
  return getCache<QualityRevisionDetailPayload>(
    revisionDetailKey(projectId, revisionId),
  );
}

export async function resolveQualityRevision(
  projectId: string,
  clientMutationId: string,
) {
  return apiJson<{
    revision: {
      id: string;
      project_id: string;
      tower_id: string;
      mobile_client_mutation_id: string | null;
    } | null;
  }>(
    `/api/mobile/quality/details/revisions/resolve?projectId=${encodeURIComponent(projectId)}&clientMutationId=${encodeURIComponent(clientMutationId)}`,
    { timeoutMs: 20_000 },
  );
}

export async function getDefectAssignees(
  projectId: string,
) {
  const payload = await apiJson<{
    users?: DefectAssignee[];
  }>(
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
  return apiJson<{
    defect: QualityDefect;
    warning?: string | null;
  }>(
    `/api/quality/defects/${encodeURIComponent(defectId)}`,
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

export async function addDefectAction(
  defectId: string,
  action: string,
) {
  return apiJson<{
    action: Record<string, unknown>;
    warning?: string | null;
  }>(
    `/api/quality/defects/${encodeURIComponent(defectId)}/actions`,
    {
      method: "POST",
      body: JSON.stringify({ action }),
    },
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
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
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
    {
      method: "PATCH",
      body: JSON.stringify(patch),
    },
  );
}

export async function uploadQualityPhoto(input: {
  projectId: string;
  towerId: string;
  defectId?: string;
  revisionId?: string;
  revisionItemId?: string;
  fileRole:
    | "defect_photo"
    | "before_photo"
    | "after_photo";
  uri: string;
  name: string;
  mimeType: string;
  capturedAt?: string;
}) {
  const form = new FormData();

  form.append("projectId", input.projectId);
  form.append("towerId", input.towerId);

  if (input.defectId) {
    form.append("defectId", input.defectId);
  }

  if (input.revisionId) {
    form.append("revisionId", input.revisionId);
  }

  if (input.revisionItemId) {
    form.append("revisionItemId", input.revisionItemId);
  }

  form.append("fileRole", input.fileRole);
  form.append(
    "capturedAt",
    input.capturedAt ?? new Date().toISOString(),
  );

  form.append(
    "file",
    {
      uri: input.uri,
      name: input.name,
      type: input.mimeType,
    } as unknown as Blob,
  );

  const response = await apiFetch(
    "/api/quality/files/upload",
    {
      method: "POST",
      body: form,
      timeoutMs: 120_000,
    },
  );

  const data = (await response
    .json()
    .catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(
      data?.error ??
        "Quality evidence could not be uploaded.",
    );
  }

  return data;
}

export async function shareQualityFile(
  fileId: string,
  fileName: string,
) {
  const response = await apiFetch(
    `/api/quality/files/${encodeURIComponent(fileId)}/content`,
    { timeoutMs: 120_000 },
  );

  if (!response.ok) {
    throw new Error(
      "Quality evidence could not be opened.",
    );
  }

  const bytes = new Uint8Array(
    await response.arrayBuffer(),
  );
  const safe = (
    fileName || "quality-evidence"
  ).replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = new File(
    Paths.cache,
    `${Date.now()}-${safe}`,
  );

  file.create({
    overwrite: true,
    intermediates: true,
  });
  file.write(bytes);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri);
  }

  return file.uri;
}

export async function submitRevisionForReview(
  revisionId: string,
) {
  return apiJson<{
    revision: QualityRevision;
    notification?: {
      recipients?: number;
      inApp?: number;
      email?: number;
      push?: number;
      warning?: string | null;
    };
  }>(
    `/api/quality/revisions/${encodeURIComponent(revisionId)}/submit-review`,
    { method: "POST", timeoutMs: 120_000 },
  );
}

export async function downloadQualityFile(
  fileId: string,
  fileName: string,
) {
  const response = await apiFetch(
    `/api/quality/files/${encodeURIComponent(fileId)}/content`,
    { timeoutMs: 120_000 },
  );

  if (!response.ok) {
    throw new Error(
      "Quality evidence could not be opened.",
    );
  }

  const bytes = new Uint8Array(
    await response.arrayBuffer(),
  );
  const safe = (
    fileName || "quality-evidence"
  ).replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = new File(
    Paths.cache,
    `${Date.now()}-${safe}`,
  );

  file.create({
    overwrite: true,
    intermediates: true,
  });
  file.write(bytes);
  return file.uri;
}

export type QualityMemberCatalogRow = {
  id: string;
  towerId: string;
  bundleReference: string | null;
  drawingNumber: string | null;
  memberNumber: string;
  alternateMemberNumber: string | null;
  qtyPerTower: number | null;
  section: string | null;
  towerSegment: string | null;
};

const qualityMemberCacheKey = (
  projectId: string,
  towerId: string,
) => `quality:members:${projectId}:${towerId}`;

export async function cachedQualityMemberCatalog(
  projectId: string,
  towerId: string,
) {
  return getCache<QualityMemberCatalogRow[]>(
    qualityMemberCacheKey(projectId, towerId),
  );
}

export async function refreshQualityMemberCatalog(
  projectId: string,
  towerId: string,
) {
  const payload = await apiJson<{
    members?: QualityMemberCatalogRow[];
  }>(
    `/api/mobile/quality/members?projectId=${encodeURIComponent(projectId)}&towerId=${encodeURIComponent(towerId)}`,
    { timeoutMs: 45_000 },
  );

  const members = payload.members ?? [];

  await setCache(
    qualityMemberCacheKey(projectId, towerId),
    members,
  );

  return members;
}

export async function createQualityRevision(input: {
  projectId: string;
  towerId: string;
  inspectionStage: string;
  inspectionDate: string;
  clientInspector?: string | null;
  clientCompany?: string | null;
  clientReference?: string | null;
  notes?: string | null;
  clientMutationId?: string | null;
}) {
  return apiJson<{
    revision: QualityRevision;
    notification?: {
      recipients?: number;
      inApp?: number;
      email?: number;
      push?: number;
      warning?: string | null;
    };
  }>("/api/mobile/quality/revisions", {
    method: "POST",
    body: JSON.stringify(input),
    timeoutMs: 60_000,
  });
}
