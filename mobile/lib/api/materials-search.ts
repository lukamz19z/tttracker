import { apiJson } from "@/lib/api/client";
import { getCache, setCache } from "@/lib/offline/db";

export type MaterialSearchKind = "all" | "member" | "bundle" | "bolt";

export type MaterialSearchResult = {
  kind: Exclude<MaterialSearchKind, "all">;
  id: string;
  towerId: string;
  towerName: string;
  title: string;
  subtitle: string;
  meta: string;
  record: Record<string, unknown>;
};

export type MaterialSearchPayload = {
  query: string;
  kind: MaterialSearchKind;
  results: MaterialSearchResult[];
};

function normaliseQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function searchCacheKey(
  projectId: string,
  query: string,
  kind: MaterialSearchKind,
) {
  return `materials:search:${projectId}:${kind}:${encodeURIComponent(normaliseQuery(query))}`;
}

export async function cachedMaterialSearch(
  projectId: string,
  query: string,
  kind: MaterialSearchKind = "all",
) {
  if (!projectId || normaliseQuery(query).length < 2) return null;
  return getCache<MaterialSearchPayload>(searchCacheKey(projectId, query, kind));
}

export async function searchMaterials(
  projectId: string,
  query: string,
  kind: MaterialSearchKind = "all",
  limit = 60,
): Promise<MaterialSearchPayload> {
  const cleaned = query.trim().replace(/\s+/g, " ");

  if (!projectId) throw new Error("Select a project first.");
  if (cleaned.length < 2) {
    return { query: cleaned, kind, results: [] };
  }

  const params = new URLSearchParams({
    projectId,
    q: cleaned,
    kind,
    limit: String(Math.max(1, Math.min(limit, 80))),
  });

  const payload = await apiJson<MaterialSearchPayload>(
    `/api/mobile/materials/search?${params.toString()}`,
    { timeoutMs: 12_000 },
  );

  await setCache(searchCacheKey(projectId, cleaned, kind), payload);
  return payload;
}
