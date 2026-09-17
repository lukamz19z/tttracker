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

export const materialCacheKey = (projectId: string) =>
  `materials:${projectId}`;

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
  const data = await apiJson<MaterialPayload>(
    `/api/mobile/materials/bootstrap?projectId=${encodeURIComponent(projectId)}`,
    { timeoutMs: 120_000 },
  );

  await setCache(materialCacheKey(projectId), data);
  return data;
}

export async function cachedMaterials(projectId: string) {
  return getCache<MaterialPayload>(materialCacheKey(projectId));
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
