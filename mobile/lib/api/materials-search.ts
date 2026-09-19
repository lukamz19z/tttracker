import { apiJson } from "@/lib/api/client";
import { getCache, setCache } from "@/lib/offline/db";

export type MaterialSearchKind = "all" | "member" | "bundle" | "bolt";
export type MaterialMemberSearchField =
  | "all"
  | "mark"
  | "pn"
  | "drawing"
  | "bundle"
  | "segment";

export type MaterialSearchFilters = {
  towerId?: string;
  memberField?: MaterialMemberSearchField;
};

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
  towerId: string;
  memberField: MaterialMemberSearchField;
  results: MaterialSearchResult[];
};

function normaliseQuery(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function searchCacheKey(
  projectId: string,
  query: string,
  kind: MaterialSearchKind,
  filters: MaterialSearchFilters = {},
) {
  const towerId = clean(filters.towerId) || "all-towers";
  const memberField = filters.memberField ?? "all";

  return [
    "materials:search",
    projectId,
    kind,
    memberField,
    towerId,
    encodeURIComponent(normaliseQuery(query)),
  ].join(":");
}

export async function cachedMaterialSearch(
  projectId: string,
  query: string,
  kind: MaterialSearchKind = "all",
  filters: MaterialSearchFilters = {},
) {
  if (!projectId || normaliseQuery(query).length < 2) return null;

  return getCache<MaterialSearchPayload>(
    searchCacheKey(projectId, query, kind, filters),
  );
}

export async function searchMaterials(
  projectId: string,
  query: string,
  kind: MaterialSearchKind = "all",
  limit = 60,
  filters: MaterialSearchFilters = {},
): Promise<MaterialSearchPayload> {
  const cleaned = query.trim().replace(/\s+/g, " ");
  const towerId = clean(filters.towerId);
  const memberField = filters.memberField ?? "all";

  if (!projectId) throw new Error("Select a project first.");

  if (cleaned.length < 2) {
    return {
      query: cleaned,
      kind,
      towerId,
      memberField,
      results: [],
    };
  }

  const params = new URLSearchParams({
    projectId,
    q: cleaned,
    kind,
    limit: String(Math.max(1, Math.min(limit, 80))),
  });

  if (towerId) params.set("towerId", towerId);
  if (kind === "member" && memberField !== "all") {
    params.set("memberField", memberField);
  }

  const payload = await apiJson<MaterialSearchPayload>(
    `/api/mobile/materials/search?${params.toString()}`,
    { timeoutMs: 12_000 },
  );

  await setCache(searchCacheKey(projectId, cleaned, kind, filters), payload);
  return payload;
}
