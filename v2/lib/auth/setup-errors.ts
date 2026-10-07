import { PASSWORD_POLICY, passwordRequirement } from "./password-policy";

export type SetupError = { code: string; message: string; retryable: boolean };

export function setupError(code: string): SetupError {
  const messages: Record<string, string> = {
    INVITATION_EXPIRED:
      "This setup link has expired. Ask your organisation administrator to resend the invitation.",
    INVITATION_REVOKED:
      "This invitation has been revoked and is no longer valid.",
    INVITATION_ALREADY_USED:
      "Account setup is already complete. Sign in to continue.",
    INVALID_TOKEN:
      "This setup link is invalid. Request a new invitation from your organisation administrator.",
    AUTH_SESSION_MISSING:
      "Your setup session is unavailable. Open the invitation link again or sign in with the invited account.",
    PASSWORD_POLICY_FAILED:
      "This password does not meet the password requirements. Choose a stronger password and try again.",
    PASSWORD_ALREADY_USED:
      "Choose a password different from your current password.",
    AUTH_REAUTHENTICATION_REQUIRED:
      "Sign in again before changing your password.",
    SETUP_RETRY_REQUIRED:
      "Account setup could not be completed. Please try again.",
    PASSWORD_SAVED_PROVISIONING_PENDING:
      "Your password was saved, but organisation access could not be completed. Try again using the same password.",
    INVITATION_ROLE_UNAVAILABLE:
      "The invitation role is unavailable. Ask your organisation administrator to review the invitation.",
  };
  return {
    code,
    message: messages[code] ?? messages.SETUP_RETRY_REQUIRED,
    retryable: [
      "SETUP_RETRY_REQUIRED",
      "PASSWORD_SAVED_PROVISIONING_PENDING",
      "PASSWORD_POLICY_FAILED",
      "PASSWORD_ALREADY_USED",
    ].includes(code),
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

// Only return our messages and recognised policy details, never raw Auth/SQL text.
export function mapSetupAuthError(error: unknown): SetupError {
  const value = record(error);
  const code =
    typeof value.code === "string" ? value.code : record(value.details).code;
  if (code === "weak_password" || value.name === "AuthWeakPasswordError") {
    const reasons = Array.isArray(value.reasons) ? value.reasons : [];
    if (reasons.includes("length") || reasons.includes("min_length")) {
      const match =
        typeof value.message === "string"
          ? value.message.match(/at least (\d+) characters/i)
          : null;
      const minimum = Math.max(
        PASSWORD_POLICY.minimumLength,
        match ? Number(match[1]) : PASSWORD_POLICY.minimumLength,
      );
      return {
        code: "PASSWORD_TOO_SHORT",
        message: passwordRequirement(minimum),
        retryable: true,
      };
    }
    if (reasons.includes("pwned"))
      return {
        code: "PASSWORD_POLICY_FAILED",
        message:
          "Choose a password that has not appeared in a known data breach.",
        retryable: true,
      };
    return setupError("PASSWORD_POLICY_FAILED");
  }
  if (code === "otp_expired" || code === "flow_state_expired")
    return setupError("INVITATION_EXPIRED");
  if (
    code === "session_expired" ||
    code === "session_not_found" ||
    code === "refresh_token_not_found" ||
    value.name === "AuthSessionMissingError"
  )
    return setupError("AUTH_SESSION_MISSING");
  if (
    [
      "bad_jwt",
      "bad_code_verifier",
      "flow_state_not_found",
      "invite_not_found",
    ].includes(String(code))
  )
    return setupError("INVALID_TOKEN");
  if (code === "same_password") return setupError("PASSWORD_ALREADY_USED");
  if (
    code === "reauthentication_needed" ||
    code === "reauthentication_not_valid"
  )
    return setupError("AUTH_REAUTHENTICATION_REQUIRED");
  return setupError("SETUP_RETRY_REQUIRED");
}

export function mapInvitationError(message: string): SetupError {
  if (message.includes("INVITATION_AUTHENTICATION_REQUIRED"))
    return setupError("AUTH_SESSION_MISSING");
  if (message.includes("INVITATION_ACCESS_DENIED"))
    return setupError("INVALID_TOKEN");
  if (message.includes("INVITATION_NOT_PENDING_OR_EXPIRED"))
    return setupError("INVITATION_EXPIRED");
  if (message.includes("INVITATION_ROLE_NOT_AVAILABLE"))
    return setupError("INVITATION_ROLE_UNAVAILABLE");
  return setupError("SETUP_RETRY_REQUIRED");
}
