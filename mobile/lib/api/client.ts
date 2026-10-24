import { manuallyOffline } from "@/lib/offline/connectivity";
import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export class ApiRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
  /** Set false only when two identical GETs must intentionally run separately. */
  dedupe?: boolean;
};

export function canonicalBase(value: string) {
  return value.trim().replace(
    /^https?:\/\/(?:www\.)?tttracker\.com\.au(?=\/|$)/i,
    "https://www.tttracker.com.au",
  ).replace(/\/+$/, "");
}

export const API_BASE_URL = canonicalBase(
  process.env.EXPO_PUBLIC_TTTRACKER_WEB_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    "https://www.tttracker.com.au",
);

export function apiUrl(input: string) {
  const value = input.trim();

  if (/^https?:\/\//i.test(value)) {
    return canonicalBase(value);
  }

  return `${API_BASE_URL}${value.startsWith("/") ? "" : "/"}${value}`;
}

let sessionPromise: Promise<Session | null> | null = null;
const inFlightJson = new Map<string, Promise<unknown>>();

function currentSession(): Promise<Session | null> {
  if (sessionPromise) return sessionPromise;

  const task = supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) throw error;
      return data.session;
    });

  const tracked = task.finally(() => {
    if (sessionPromise === tracked) {
      sessionPromise = null;
    }
  });

  sessionPromise = tracked;
  return tracked;
}

async function performFetch(
  input: string,
  init: ApiRequestInit,
  session: Session | null,
): Promise<Response> {
  const {
    timeoutMs = 30_000,
    dedupe: _dedupe,
    signal: externalSignal,
    ...requestInit
  } = init;

  if (manuallyOffline()) throw new Error("This action requires a connection.");
  const headers = new Headers(requestInit.headers);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (timeZone) headers.set("X-TTTracker-Timezone", timeZone);

  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }

  if (
    typeof requestInit.body === "string" &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const controller = new AbortController();

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener(
        "abort",
        () => controller.abort(),
        { once: true },
      );
    }
  }

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = apiUrl(input);
    const startedAt = Date.now();
    const options: RequestInit = {
      ...requestInit,
      headers,
      cache: "no-store",
      signal: controller.signal,
    };
    let response = await fetch(url, options);
    // Safety only: a redirected authenticated GET may lose its Authorization.
    // Never forward credentials to an arbitrary redirect host or retry writes.
    if (response.status === 401 && response.redirected &&
        response.url.startsWith("https://www.tttracker.com.au/") &&
        canonicalBase(response.url) === canonicalBase(url) &&
        String(requestInit.method ?? "GET").toUpperCase() === "GET") {
      response = await fetch(canonicalBase(response.url), options);
    }
    if (__DEV__ && (new URL(url).pathname === "/api/access/me" || /\/api\/(mobile\/)?quality\//.test(new URL(url).pathname))) {
      console.debug("TTTracker API response", { url: url.split("?")[0], status: response.status, durationMs: Date.now() - startedAt });
    }
    return response;
  } catch (error) {
    if (controller.signal.aborted && !externalSignal?.aborted) {
      throw new Error(
        `TTTracker request timed out after ${Math.ceil(timeoutMs / 1000)} seconds.`,
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(
  input: string,
  init: ApiRequestInit = {},
): Promise<Response> {
  if (manuallyOffline()) throw new Error("This action requires a connection.");
  const session = await currentSession();
  return performFetch(input, init, session);
}

function isResponseLike(value: unknown): value is Response {
  if (!value || typeof value !== "object") return false;

  const candidate = value as {
    text?: unknown;
    ok?: unknown;
    status?: unknown;
  };

  return (
    typeof candidate.text === "function" &&
    typeof candidate.ok === "boolean" &&
    typeof candidate.status === "number"
  );
}

function payloadError(value: unknown) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "error" in value
  ) {
    return String(
      (value as { error?: unknown }).error ?? "",
    ).trim();
  }

  return "";
}

/**
 * Finance, Approvals and some older TTTracker modules historically call
 * jsonBody() with either a fetch Response OR an already-parsed object.
 *
 * Accept both shapes so a harmless refactor in one API module cannot crash
 * another module with `response.text is not a function`.
 */
export async function jsonBody<T>(
  responseOrPayload:
    | Response
    | Promise<Response>
    | T
    | Promise<T>
    | string
    | null
    | undefined,
  fallback = "TTTracker request failed.",
): Promise<T> {
  const value = await Promise.resolve(responseOrPayload);

  if (isResponseLike(value)) {
    const text = await value.text();
    let payload: unknown = {};

    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        if (!value.ok) {
          throw new ApiRequestError(`TTTracker service returned HTTP ${value.status} instead of JSON. Check that the website API has been deployed.`, value.status);
        }

        throw new Error(
          `TTTracker returned invalid JSON (${value.status}).`,
        );
      }
    }

    if (!value.ok) {
      throw new ApiRequestError(
        payloadError(payload) || `${fallback} (${value.status}).`, value.status,
        payload && typeof payload === "object" && "code" in payload ? String(payload.code) : undefined,
      );
    }

    return payload as T;
  }

  if (typeof value === "string") {
    if (!value.trim()) return {} as T;

    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error(fallback);
    }
  }

  if (value === null || value === undefined) {
    return {} as T;
  }

  const error = payloadError(value);
  if (error) {
    throw new Error(error);
  }

  return value as T;
}

export async function apiJson<T>(
  input: string,
  init: ApiRequestInit = {},
): Promise<T> {
  if (manuallyOffline()) throw new Error("This action requires a connection.");
  const method = String(init.method ?? "GET").toUpperCase();
  const canDedupe =
    init.dedupe !== false &&
    method === "GET" &&
    init.body == null &&
    init.signal == null;

  if (!canDedupe) {
    return jsonBody<T>(
      apiFetch(input, init),
      "TTTracker request failed.",
    );
  }

  const session = await currentSession();
  const tokenTail = session?.access_token.slice(-12) ?? "anon";
  const key = [
    session?.user.id ?? "anon",
    tokenTail,
    method,
    apiUrl(input),
    String(init.timeoutMs ?? 30_000),
  ].join("|");

  const existing = inFlightJson.get(key);
  if (existing) {
    return existing as Promise<T>;
  }

  const task = jsonBody<T>(
    performFetch(input, init, session),
    "TTTracker request failed.",
  );

  const tracked = task.finally(() => {
    if (inFlightJson.get(key) === tracked) {
      inFlightJson.delete(key);
    }
  });

  inFlightJson.set(key, tracked);
  return tracked;
}
