import { apiJson } from "@/lib/api/client";
import { getCache, setCache } from "@/lib/offline/db";
import { logMobilePerf } from "@/lib/perf-trace";

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
  nextOffset?: number | null;
  hasMore?: boolean;
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
  offset = 0,
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
    String(offset),
  ].join(":");
}

export async function cachedMaterialSearch(
  projectId: string,
  query: string,
  kind: MaterialSearchKind = "all",
  filters: MaterialSearchFilters = {},
  offset = 0,
) {
  if (!projectId || normaliseQuery(query).length < 2) return null;

  return getCache<MaterialSearchPayload>(
    searchCacheKey(projectId, query, kind, filters, offset),
  );
}

export async function searchMaterials(
  projectId: string,
  query: string,
  kind: MaterialSearchKind = "all",
  limit = 60,
  filters: MaterialSearchFilters = {},
  offset = 0,
): Promise<MaterialSearchPayload> {
  const startedAt = Date.now();
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
      nextOffset: null,
      hasMore: false,
    };
  }

  const params = new URLSearchParams({
    projectId,
    q: cleaned,
    kind,
    limit: String(Math.max(1, Math.min(limit, 80))),
    offset: String(Math.max(0, Math.floor(offset))),
  });

  if (towerId) params.set("towerId", towerId);
  if (kind === "member" && memberField !== "all") {
    params.set("memberField", memberField);
  }

  try {
    const payload = await apiJson<MaterialSearchPayload>(
      `/api/mobile/materials/search?${params.toString()}`,
      { timeoutMs: 12_000 },
    );
    await setCache(searchCacheKey(projectId, cleaned, kind, filters, offset), payload);
    logMobilePerf("materials-search", { module: "materials", operation: kind === "member" ? "members.search" : "materials.search", projectId, durationMs: Date.now() - startedAt, outcome: "success", resultCount: payload.results.length, offset, hasMore: Boolean(payload.hasMore) });
    return payload;
  } catch (error) {
    const value = error && typeof error === "object" ? error as { status?: unknown; code?: unknown } : {};
    const code = typeof value.code === "string" && /^[A-Z0-9_]{2,24}$/.test(value.code) ? value.code : undefined;
    logMobilePerf("materials-search", { module: "materials", operation: kind === "member" ? "members.search" : "materials.search", projectId, durationMs: Date.now() - startedAt, outcome: "failure", category: Number.isInteger(value.status) ? "http" : "network_or_timeout", ...(Number.isInteger(value.status) ? { status: value.status } : {}), ...(code ? { errorCode: code } : {}), offset });
    throw error;
  }
}
