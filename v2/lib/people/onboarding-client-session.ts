export const onboardingErrors: Record<string, string> = {
  ONBOARDING_LINK_INVALID: "This onboarding link is invalid.",
  ONBOARDING_LINK_EXPIRED:
    "This onboarding link has expired. Contact the organisation for a new invitation.",
  ONBOARDING_LINK_REVOKED:
    "This onboarding invitation is no longer active. Contact the organisation for a new invitation.",
  ONBOARDING_LINK_USED:
    "This secure link has already been used. Resume on the device where you opened it, or contact the organisation for a new link.",
  ONBOARDING_SESSION_INVALID:
    "Your onboarding session has expired. Contact the organisation for a new secure link. Your saved draft is retained.",
  ONBOARDING_VALUE_INVALID:
    "Check the entered dates, email and configured field values, then retry.",
  ONBOARDING_FIELD_INVALID:
    "This request is not available for your onboarding.",
  ONBOARDING_ORIGIN_DENIED:
    "This onboarding address is not configured for secure access. Contact the organisation.",
};
export async function onboardingResponse(response: Response) {
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      onboardingErrors[String(result.error)] ??
        "We couldn't load your onboarding right now. Try again or contact the organisation.",
    );
  return result;
}
/** Fragment secrets travel only in the exchange POST, never persistence or logs. */
export async function resumeOnboarding(
  fetcher: typeof fetch,
  location: Pick<Location, "hash" | "pathname" | "search">,
  clearFragment: () => void,
) {
  const token = new URLSearchParams(location.hash.slice(1)).get("token");
  if (token) {
    await onboardingResponse(
      await fetcher("/api/onboarding/security/exchange", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }),
    );
    clearFragment();
  }
  return onboardingResponse(
    await fetcher("/api/onboarding/security/workflow", {
      cache: "no-store",
      credentials: "same-origin",
    }),
  );
}
