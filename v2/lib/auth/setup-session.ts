import type { SupabaseClient } from "@supabase/supabase-js";
import { mapSetupAuthError, setupError } from "./setup-errors";

export async function establishSetupSession(
  client: SupabaseClient,
  href: string,
  cleanUrl: (url: string) => void,
) {
  const url = new URL(href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const callbackError =
    fragment.get("error_code") ?? url.searchParams.get("error_code");
  const accessToken = fragment.get("access_token");
  const refreshToken = fragment.get("refresh_token");
  // SSR's PKCE client cannot automatically process admin-generated implicit links.
  // setSession validates the Auth-issued token and persists the normal cookie session.
  if (accessToken || refreshToken) {
    if (!accessToken || !refreshToken) return setupError("INVALID_TOKEN");
    const { error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) return mapSetupAuthError(error);
  }
  const { data, error } = await client.auth.getSession();
  if (error) return mapSetupAuthError(error);
  if (!data.session)
    return callbackError
      ? mapSetupAuthError({ code: callbackError })
      : setupError("AUTH_SESSION_MISSING");
  // Remove auth material only once the SDK has durably saved a valid session.
  if (
    accessToken ||
    refreshToken ||
    callbackError ||
    url.searchParams.has("code")
  ) {
    url.hash = "";
    for (const key of ["code", "error", "error_code", "error_description"])
      url.searchParams.delete(key);
    cleanUrl(url.pathname + url.search);
  }
  return null;
}
