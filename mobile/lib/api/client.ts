import type { Session } from "@supabase/supabase-js";

import { supabase } from "@/lib/supabase";

export type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
  /** Set false only when two identical GETs must intentionally run separately. */
  dedupe?: boolean;
};

function canonicalBase(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");

  if (/^https:\/\/tttracker\.com\.au$/i.test(trimmed)) {
    return "https://www.tttracker.com.au";
  }

  return trimmed;
}

export const API_BASE_URL = canonicalBase(
  process.env.EXPO_PUBLIC_TTTRACKER_WEB_URL ||
    process.env.EXPO_PUBLIC_API_URL ||
    "https://www.tttracker.com.au",
);

export function apiUrl(input: string) {
  const value = input.trim();

  if (/^https?:\/\//i.test(value)) {
    return value.replace(
      /^https:\/\/tttracker\.com\.au(?=\/|$)/i,
      "https://www.tttracker.com.au",
    );
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

  const headers = new Headers(requestInit.headers);

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
    return await fetch(apiUrl(input), {
      ...requestInit,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
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
          throw new Error(
            text.trim() || `${fallback} (${value.status}).`,
          );
        }

        throw new Error(
          `TTTracker returned invalid JSON (${value.status}).`,
        );
      }
    }

    if (!value.ok) {
      throw new Error(
        payloadError(payload) ||
          (text.trim()
            ? text.trim()
            : `${fallback} (${value.status}).`),
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
