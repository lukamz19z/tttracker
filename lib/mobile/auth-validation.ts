export type AuthFailureClassification = {
  category: "invalid_session" | "provider_forbidden" | "provider_unavailable";
  status: number;
  errorCode: string | null;
};

export class AuthProviderUnavailableError extends Error {
  readonly status: number;
  readonly errorCode: string | null;

  constructor(status: number, errorCode: string | null, cause?: unknown) {
    super("Authentication provider is temporarily unavailable.", { cause });
    this.name = "AuthProviderUnavailableError";
    this.status = status;
    this.errorCode = errorCode;
  }
}

function safeCode(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,64}$/.test(value) ? value : null;
}

export function classifySupabaseAuthFailure(error: unknown): AuthFailureClassification {
  const value = error && typeof error === "object" ? error as { status?: unknown; code?: unknown } : {};
  const status = Number(value.status);
  const errorCode = safeCode(value.code);

  if (status === 400 || status === 401) return { category: "invalid_session", status: 401, errorCode };
  if (status === 403) return { category: "provider_forbidden", status: 403, errorCode };

  const message = error instanceof Error ? error.message : "";
  const transient = status === 408 || (Number.isFinite(status) && status >= 500)
    || error instanceof TypeError
    || /timeout|timed out|network|fetch failed|connection reset|socket hang up|econnreset|enotfound/i.test(message);
  if (transient) {
    const transientStatus = status >= 500 && status <= 599 ? status : 503;
    return { category: "provider_unavailable", status: transientStatus, errorCode };
  }

  // Unknown verification failures must not masquerade as invalid credentials.
  return { category: "provider_unavailable", status: 503, errorCode };
}

export function mobileAuthErrorResponse(error: unknown): { status: number; message: string } | null {
  if (error instanceof AuthProviderUnavailableError) {
    return { status: error.status, message: "Authentication provider is temporarily unavailable. Please retry." };
  }
  if (error instanceof Error && error.message === "MOBILE_AUTH_PROVIDER_FORBIDDEN") {
    return { status: 403, message: "Authentication provider denied this session." };
  }
  if (error instanceof Error && (error.message === "You must be logged in." || error.message === "Missing authentication token.")) {
    return { status: 401, message: "You must be signed in." };
  }
  return null;
}
