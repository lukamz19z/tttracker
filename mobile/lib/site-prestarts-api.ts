import { getCache, setCache } from "@/lib/offline/db";
import { supabase } from "@/lib/supabase";

const WEB_BASE_URL = (
  process.env.EXPO_PUBLIC_TTTRACKER_WEB_URL ||
  "https://www.tttracker.com.au"
).replace(/\/+$/, "");

const BOOTSTRAP_CACHE_KEY = "site-prestarts:bootstrap:v1";
const REGISTER_CACHE_KEY = "site-prestarts:register:v1";
const PENDING_SIGNATURES_KEY = "site-prestarts:pending-signatures:v1";

const detailCacheKey = (prestartId: string) =>
  `site-prestarts:detail:v1:${prestartId}`;

export type SitePrestartSignaturePoint = {
  x: number;
  y: number;
};

export type PendingSitePrestartSignature = {
  id: string;
  prestartId: string;
  revisionNo: number;
  employee: {
    id: string;
    fullName: string;
    payrollId: string | null;
  };
  breathalyserReading: string | null;
  declarationText: string;
  signatureStrokes: SitePrestartSignaturePoint[][];
  signatureWidth: number;
  signatureHeight: number;
  signedAt: string;
};

export async function sitePrestartApi(
  path: string,
  init: RequestInit = {},
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Your TTTracker session has expired. Sign in again.");
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.access_token}`);

  if (
    init.body &&
    typeof init.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${WEB_BASE_URL}${path}`, {
    ...init,
    headers,
  });
}

export async function readSitePrestartJson<T>(
  response: Response,
  fallback: string,
): Promise<T> {
  const text = await response.text();

  let payload: unknown = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    if (!response.ok) {
      throw new Error(text || fallback);
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload
        ? String((payload as { error?: unknown }).error ?? "")
        : "";

    throw new Error(message || fallback);
  }

  return payload as T;
}

export function cacheSitePrestartBootstrap<T>(payload: T) {
  return setCache(BOOTSTRAP_CACHE_KEY, payload);
}

export function cachedSitePrestartBootstrap<T>() {
  return getCache<T>(BOOTSTRAP_CACHE_KEY);
}

export function cacheSitePrestartRegister<T>(payload: T) {
  return setCache(REGISTER_CACHE_KEY, payload);
}

export function cachedSitePrestartRegister<T>() {
  return getCache<T>(REGISTER_CACHE_KEY);
}

export function cacheSitePrestartDetail<T>(prestartId: string, payload: T) {
  return setCache(detailCacheKey(prestartId), payload);
}

export function cachedSitePrestartDetail<T>(prestartId: string) {
  return getCache<T>(detailCacheKey(prestartId));
}

export async function loadPendingSitePrestartSignatures() {
  const cached = await getCache<PendingSitePrestartSignature[]>(
    PENDING_SIGNATURES_KEY,
  );
  return cached?.value ?? [];
}

async function savePendingSitePrestartSignatures(
  rows: PendingSitePrestartSignature[],
) {
  await setCache(PENDING_SIGNATURES_KEY, rows);
  return rows;
}

export async function queueSitePrestartSignature(
  input: Omit<PendingSitePrestartSignature, "id"> & { id?: string },
) {
  const existing = await loadPendingSitePrestartSignatures();
  const id = input.id || `site-prestart-signature-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  const next: PendingSitePrestartSignature = {
    ...input,
    id,
  };

  // One pending acknowledgement per employee per discussion revision.
  const rows = [
    ...existing.filter(
      (row) =>
        !(
          row.prestartId === next.prestartId &&
          row.revisionNo === next.revisionNo &&
          row.employee.id === next.employee.id
        ),
    ),
    next,
  ];

  await savePendingSitePrestartSignatures(rows);
  return next;
}

export async function removePendingSitePrestartSignature(id: string) {
  const existing = await loadPendingSitePrestartSignatures();
  return savePendingSitePrestartSignatures(
    existing.filter((row) => row.id !== id),
  );
}

export async function removePendingSignatureForEmployee(
  prestartId: string,
  revisionNo: number,
  employeeId: string,
) {
  const existing = await loadPendingSitePrestartSignatures();
  return savePendingSitePrestartSignatures(
    existing.filter(
      (row) =>
        !(
          row.prestartId === prestartId &&
          row.revisionNo === revisionNo &&
          row.employee.id === employeeId
        ),
    ),
  );
}

export async function syncPendingSitePrestartSignatures() {
  const existing = await loadPendingSitePrestartSignatures();
  if (!existing.length) {
    return { synced: 0, remaining: 0, rows: existing };
  }

  const remaining: PendingSitePrestartSignature[] = [];
  let synced = 0;

  for (const row of existing) {
    try {
      const response = await sitePrestartApi(
        `/api/site-prestarts/${encodeURIComponent(row.prestartId)}/attendees`,
        {
          method: "POST",
          body: JSON.stringify({
            employeeId: row.employee.id,
            breathalyserReading: row.breathalyserReading,
            declarationAccepted: true,
            signatureStrokes: row.signatureStrokes,
            signatureWidth: row.signatureWidth,
            signatureHeight: row.signatureHeight,
            signedAt: row.signedAt,
            discussionRevisionNo: row.revisionNo,
          }),
        },
      );

      await readSitePrestartJson(
        response,
        `Could not upload ${row.employee.fullName}'s Site Prestart signature.`,
      );
      synced += 1;
    } catch {
      remaining.push(row);
    }
  }

  await savePendingSitePrestartSignatures(remaining);
  return { synced, remaining: remaining.length, rows: remaining };
}
