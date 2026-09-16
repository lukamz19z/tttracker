import { apiJson } from "@/lib/api/client";
import { getCache, setCache } from "@/lib/offline/db";
import type { MaterialPayload } from "@/types/materials";

export const materialCacheKey = (projectId: string) => `materials:${projectId}`;

export async function refreshMaterials(projectId: string) {
  const data = await apiJson<MaterialPayload>(`/api/mobile/materials/bootstrap?projectId=${encodeURIComponent(projectId)}`, { timeoutMs: 120_000 });
  await setCache(materialCacheKey(projectId), data);
  return data;
}

export async function cachedMaterials(projectId: string) {
  return getCache<MaterialPayload>(materialCacheKey(projectId));
}
