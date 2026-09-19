import { apiFetch, apiJson } from "@/lib/api/client";
import { getCache, setCache } from "@/lib/offline/db";
import type {
  BundleCheckRecord,
  CreateTransferInput,
  MaterialPayload,
  MemberCheckRecord,
  RecordMissingReceiptInput,
  SaveBundleCheckInput,
  SaveMemberCheckInput,
  TransferRecord,
} from "@/types/materials";

const MATERIAL_CACHE_VERSION = 2;

export const materialCacheKey = (projectId: string) =>
  `materials:v${MATERIAL_CACHE_VERSION}:${projectId}`;

const legacyMaterialCacheKey = (projectId: string) =>
  `materials:${projectId}`;

type MaterialSnapshot = MaterialPayload & {
  cacheVersion?: number;
  snapshotMode?: "summary" | string;
  catalogCounts?: {
    members?: number;
    bolts?: number;
  };
};

function slimSnapshot(value: MaterialPayload): MaterialSnapshot {
  const snapshot = value as MaterialSnapshot;

  return {
    ...snapshot,
    cacheVersion: MATERIAL_CACHE_VERSION,
    snapshotMode: snapshot.snapshotMode ?? "summary",
    catalogCounts: snapshot.catalogCounts ?? {
      members: Array.isArray(value.members) ? value.members.length : 0,
      bolts: Array.isArray(value.bolts) ? value.bolts.length : 0,
    },

    // Large static catalogues are loaded through the dedicated search API.
    members: [],
    bolts: [],
  };
}

async function readJson<T>(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error || fallback);
  }

  return payload;
}

export async function refreshMaterials(projectId: string) {
  const raw = await apiJson<MaterialSnapshot>(
    `/api/mobile/materials/bootstrap?projectId=${encodeURIComponent(projectId)}`,
    {
      // The slim bootstrap should no longer need the old two-minute allowance.
      timeoutMs: 45_000,
    },
  );

  const data = slimSnapshot(raw);
  await setCache(materialCacheKey(projectId), data);
  return data;
}

export async function cachedMaterials(projectId: string) {
  const current = await getCache<MaterialPayload>(materialCacheKey(projectId));

  if (current) {
    const slim = slimSnapshot(current.value);

    // Self-heal any unexpectedly large v2 cache without blocking rendering.
    if (
      (current.value.members?.length ?? 0) > 0 ||
      (current.value.bolts?.length ?? 0) > 0
    ) {
      void setCache(materialCacheKey(projectId), slim);
    }

    return {
      ...current,
      value: slim,
    };
  }

  /*
   * One-time migration path for users upgrading from the old full-project
   * cache. This preserves bundles/checks/deliveries/offline state but drops
   * the huge member + bolt arrays before storing the new cache format.
   */
  const legacy = await getCache<MaterialPayload>(legacyMaterialCacheKey(projectId));
  if (!legacy) return null;

  const slim = slimSnapshot(legacy.value);
  await setCache(materialCacheKey(projectId), slim);

  return {
    ...legacy,
    value: slim,
  };
}

export async function saveBundleCheck(
  bundleId: string,
  input: SaveBundleCheckInput,
) {
  const response = await apiFetch(
    `/api/mobile/materials/bundle-checks/${encodeURIComponent(bundleId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      timeoutMs: 30_000,
    },
  );

  const payload = await readJson<{ check: BundleCheckRecord }>(
    response,
    "Bundle check could not be saved.",
  );

  return payload.check;
}

export async function clearBundleCheck(bundleId: string) {
  const response = await apiFetch(
    `/api/mobile/materials/bundle-checks/${encodeURIComponent(bundleId)}`,
    { method: "DELETE", timeoutMs: 30_000 },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Bundle check could not be cleared.",
  );
}

export async function saveMemberCheck(
  memberId: string,
  input: SaveMemberCheckInput,
) {
  const response = await apiFetch(
    `/api/mobile/materials/member-checks/${encodeURIComponent(memberId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      timeoutMs: 30_000,
    },
  );

  const payload = await readJson<{ check: MemberCheckRecord }>(
    response,
    "Member status could not be saved.",
  );

  return payload.check;
}

export async function clearMemberCheck(memberId: string) {
  const response = await apiFetch(
    `/api/mobile/materials/member-checks/${encodeURIComponent(memberId)}`,
    { method: "DELETE", timeoutMs: 30_000 },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Member status could not be cleared.",
  );
}

export async function createMaterialTransfer(input: CreateTransferInput) {
  const response = await apiFetch("/api/mobile/materials/transfers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 30_000,
  });

  const payload = await readJson<{ transfer: TransferRecord }>(
    response,
    "Transfer could not be created.",
  );

  return payload.transfer;
}

export async function receiveMaterialTransfer(transferId: string) {
  const response = await apiFetch(
    `/api/mobile/materials/transfers/${encodeURIComponent(transferId)}/receive`,
    { method: "POST", timeoutMs: 30_000 },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Transfer could not be received.",
  );
}

export async function cancelMaterialTransfer(transferId: string) {
  const response = await apiFetch(
    `/api/mobile/materials/transfers/${encodeURIComponent(transferId)}/cancel`,
    { method: "POST", timeoutMs: 30_000 },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Transfer could not be cancelled.",
  );
}

export async function recordMissingReceipt(
  input: RecordMissingReceiptInput,
) {
  const response = await apiFetch(
    "/api/mobile/materials/missing/receive",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      timeoutMs: 30_000,
    },
  );

  await readJson<{ ok: boolean }>(
    response,
    "Missing material receipt could not be recorded.",
  );
}
