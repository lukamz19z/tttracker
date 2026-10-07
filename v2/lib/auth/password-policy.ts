// TTTracker intentionally requires eight characters even where Auth allows six.
// Both account-setup validation and its server endpoint use this policy.
export const PASSWORD_POLICY = { minimumLength: 8 } as const;

export function passwordRequirement(
  minimumLength: number = PASSWORD_POLICY.minimumLength,
) {
  return `Password must be at least ${minimumLength} characters.`;
}

export function validateSetupPassword(password: string, confirmation: string) {
  if (!password)
    return { code: "PASSWORD_REQUIRED", message: "Enter a password." };
  if (password.length < PASSWORD_POLICY.minimumLength)
    return { code: "PASSWORD_TOO_SHORT", message: passwordRequirement() };
  if (password !== confirmation)
    return { code: "PASSWORD_MISMATCH", message: "Passwords do not match." };
  return null;
}
