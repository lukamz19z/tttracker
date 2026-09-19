import { apiJson } from "@/lib/api/client";
import { getCache, setCache } from "@/lib/offline/db";
import type { BundleRecord, MemberRecord } from "@/types/materials";

export type BundleMembersPayload = {
  projectId: string;
  bundle: BundleRecord;
  members: MemberRecord[];
  generatedAt: string;
};

function bundleMembersCacheKey(projectId: string, bundleId: string) {
  return `materials:bundle-members:${projectId}:${bundleId}`;
}

export async function cachedBundleMembers(
  projectId: string,
  bundleId: string,
) {
  if (!projectId || !bundleId) return null;
  return getCache<BundleMembersPayload>(
    bundleMembersCacheKey(projectId, bundleId),
  );
}

export async function loadBundleMembers(
  projectId: string,
  bundleId: string,
): Promise<BundleMembersPayload> {
  if (!projectId) throw new Error("Select a project first.");
  if (!bundleId) throw new Error("This bundle has no UUID.");

  const params = new URLSearchParams({ projectId });
  const payload = await apiJson<BundleMembersPayload>(
    `/api/mobile/materials/bundles/${encodeURIComponent(bundleId)}/members?${params.toString()}`,
    { timeoutMs: 12_000 },
  );

  await setCache(bundleMembersCacheKey(projectId, bundleId), payload);
  return payload;
}
