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
) {
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

export async function apiJson<T>(
  input: string,
  init: ApiRequestInit = {},
): Promise<T> {
  const response = await apiFetch(input, init);
  const text = await response.text();

  let payload: unknown = {};

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new Error(
          text || `TTTracker request failed (${response.status}).`,
        );
      }

      throw new Error("TTTracker returned an invalid JSON response.");
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload
        ? String(
            (payload as { error?: unknown }).error ?? "",
          ).trim()
        : "";

    throw new Error(
      message || `TTTracker request failed (${response.status}).`,
    );
  }

  return payload as T;
}
