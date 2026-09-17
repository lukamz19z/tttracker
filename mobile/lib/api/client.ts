import { supabase } from "@/lib/supabase";

export type ApiRequestInit = RequestInit & {
  timeoutMs?: number;
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

export async function apiFetch(
  input: string,
  init: ApiRequestInit = {},
): Promise<Response> {
  const {
    timeoutMs = 30_000,
    signal: externalSignal,
    ...requestInit
  } = init;

  const {
    data: { session },
  } = await supabase.auth.getSession();

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
  return jsonBody<T>(
    apiFetch(input, init),
    "TTTracker request failed.",
  );
}
