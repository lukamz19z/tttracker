import { supabase } from "@/lib/supabase";

export const TTTRACKER_WEB_URL =
  process.env.EXPO_PUBLIC_TTTRACKER_WEB_URL ?? "https://tttracker.com.au";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

type ApiOptions = RequestInit & {
  timeoutMs?: number;
};

async function accessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new ApiError("Your session has expired. Please sign in again.", 401);
  return data.session.access_token;
}

function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${TTTRACKER_WEB_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiFetch(path: string, options: ApiOptions = {}) {
  const token = await accessToken();
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 45_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);

    return await fetch(absoluteUrl(path), {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiError("TTTracker took too long to respond. Check your connection and try again.", 408);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function apiJson<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set("Content-Type", headers.get("Content-Type") ?? "application/json");
  }

  const response = await apiFetch(path, { ...options, headers });
  const text = await response.text();
  let payload: unknown = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error ?? "Request failed.")
        : `TTTracker request failed (${response.status}).`;
    throw new ApiError(message, response.status, payload);
  }

  return payload as T;
}

export function jsonBody(value: unknown) {
  return JSON.stringify(value);
}
