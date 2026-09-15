import { supabase } from "@/lib/supabase";

const WEB_BASE_URL = (
  process.env.EXPO_PUBLIC_TTTRACKER_WEB_URL ||
  "https://tttracker.com.au"
).replace(/\/+$/, "");

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
