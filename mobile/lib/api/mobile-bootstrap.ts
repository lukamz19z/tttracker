import { apiJson } from "@/lib/api/client";

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
let bootstrapCache: {
  userId: string;
  expiresAt: number;
  payload?: MobileBootstrapPayload;
  pending?: Promise<MobileBootstrapPayload>;
} | null = null;

export function clearMobileBootstrapCache(userId?: string) {
  if (!userId || bootstrapCache?.userId === userId) bootstrapCache = null;
}

export function getMobileBootstrap(userId: string, force = false) {
  if (!force && bootstrapCache?.userId === userId) {
    if (bootstrapCache.pending) return bootstrapCache.pending;
    if (bootstrapCache.payload && bootstrapCache.expiresAt > Date.now()) {
      return Promise.resolve(bootstrapCache.payload);
    }
  }

  if (bootstrapCache?.userId === userId && bootstrapCache.pending) return bootstrapCache.pending;

  const entry = { userId, expiresAt: 0 } as NonNullable<typeof bootstrapCache>;
  const pending = apiJson<MobileBootstrapPayload>("/api/mobile/bootstrap")
    .then((payload) => {
      entry.payload = payload;
      entry.expiresAt = Date.now() + MOBILE_BOOTSTRAP_CACHE_MS;
      return payload;
    })
    .finally(() => {
      if (entry.pending === pending) entry.pending = undefined;
    });
  entry.pending = pending;
  bootstrapCache = entry;
  return pending;
}
