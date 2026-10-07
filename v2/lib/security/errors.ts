export function securityError(error: unknown) {
  const code = error instanceof Error ? error.message : "AUTH_ERROR";
  const messages: Record<string, string> = {
    CODE_INVALID: "That verification code is incorrect.",
    CODE_EXPIRED: "This verification code has expired. Send a new code.",
    CHALLENGE_EXPIRED:
      "This challenge is no longer available. Send a new code.",
    SEND_FAILED: "We could not send the verification email. Please try again.",
    RATE_LIMITED: "Please wait before requesting another code.",
    SESSION_MISSING:
      "Your sign-in session is unavailable. Please sign in again.",
    UNAUTHENTICATED:
      "Your sign-in session is unavailable. Please sign in again.",
    MFA_NOT_CONFIGURED: "Additional security setup is required.",
  };
  const known = code in messages;
  return {
    code: known
      ? code === "UNAUTHENTICATED"
        ? "SESSION_MISSING"
        : code
      : "AUTH_ERROR",
    error: known
      ? messages[code]
      : "Security verification is unavailable. Please try again.",
    status:
      code === "UNAUTHENTICATED" || code === "SESSION_MISSING"
        ? 401
        : code === "RATE_LIMITED"
          ? 429
          : known
            ? 400
            : 503,
  };
}
