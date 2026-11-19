import { apiJson } from "@/lib/api/client";
import { logMobilePerf } from "@/lib/perf-trace";

export type MobileBootstrapPayload = {
  error?: string;
  user?: { id: string; email: string | null };
  employee?: {
    id: string | null;
    fullName: string;
    position: string | null;
    crewId: string | null;
    crewNumber: string | null;
    crewName: string | null;
    currentProjectId: string | null;
    shirtSize: string | null;
    jacketSize: string | null;
    gloveSize: string | null;
    pantsSize: string | null;
  };
  roles?: { id: string; code: string; name: string; description: string | null }[];
  projects?: { id: string; name: string; projectNumber: string | null; status: string | null; accessRole?: string | null }[];
  permissions?: string[];
  navigation?: unknown[];
  app?: Record<string, unknown>;
  capabilities?: Record<string, unknown>;
  approvalCounts?: { dailyDockets: number; expenseClaims: number; invoices: number };
};

const MOBILE_BOOTSTRAP_CACHE_MS = 20_000;
const bootstrapCache = new Map<string, {
  userId: string;
  expiresAt: number;
  payload?: MobileBootstrapPayload;
  pending?: Promise<MobileBootstrapPayload>;
  invalidated?: boolean;
}>();
let bootstrapInvocationCount = 0;
let bootstrapNetworkCount = 0;

export function clearMobileBootstrapCache(userId?: string) {
  if (userId) {
    const entry = bootstrapCache.get(userId);
    if (entry?.pending) {
      entry.payload = undefined;
      entry.expiresAt = 0;
      entry.invalidated = true;
    } else {
      bootstrapCache.delete(userId);
    }
    return;
  }
  for (const [cachedUserId, entry] of bootstrapCache) {
    if (entry.pending) {
      entry.payload = undefined;
      entry.expiresAt = 0;
      entry.invalidated = true;
    } else {
      bootstrapCache.delete(cachedUserId);
    }
  }
}

export function getMobileBootstrap(userId: string, force = false) {
  bootstrapInvocationCount += 1;
  const entry = bootstrapCache.get(userId);
  if (entry) {
    if (entry.pending) {
      logMobilePerf("bootstrap-request", { module: "session", operation: "bootstrap", source: "in-flight", invocationCount: bootstrapInvocationCount, networkCount: bootstrapNetworkCount });
      return entry.pending;
    }
    if (!force && entry.payload && entry.expiresAt > Date.now()) {
      logMobilePerf("bootstrap-request", { module: "session", operation: "bootstrap", source: "memory", invocationCount: bootstrapInvocationCount, networkCount: bootstrapNetworkCount });
      return Promise.resolve(entry.payload);
    }
  }

  const nextEntry = entry ?? { userId, expiresAt: 0 };
  bootstrapNetworkCount += 1;
  logMobilePerf("bootstrap-request", { module: "session", operation: "bootstrap", source: "network", invocationCount: bootstrapInvocationCount, networkCount: bootstrapNetworkCount });
  const startedAt = Date.now();
  const pending = apiJson<MobileBootstrapPayload>("/api/mobile/bootstrap")
    .then((payload) => {
      if (!nextEntry.invalidated) {
        nextEntry.payload = payload;
        nextEntry.expiresAt = Date.now() + MOBILE_BOOTSTRAP_CACHE_MS;
      }
      logMobilePerf("bootstrap-complete", { module: "session", operation: "bootstrap", durationMs: Date.now() - startedAt, outcome: "success" });
      return payload;
    })
    .catch((error: unknown) => {
      logMobilePerf("bootstrap-complete", { module: "session", operation: "bootstrap", durationMs: Date.now() - startedAt, outcome: "failure", errorCategory: error instanceof Error ? error.name : "unknown" });
      throw error;
    })
    .finally(() => {
      if (nextEntry.pending === pending) {
        nextEntry.pending = undefined;
        if (nextEntry.invalidated && bootstrapCache.get(userId) === nextEntry) bootstrapCache.delete(userId);
      }
    });
  nextEntry.pending = pending;
  bootstrapCache.set(userId, nextEntry);
  return pending;
}
