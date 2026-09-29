export type SecurityMode = "off" | "optional" | "required";

export type ResolvedSecurityPolicy = {
  emailCodeMode: SecurityMode;
  totpMode: SecurityMode;
  emailCodeExpiryMinutes: number;
  maxEmailCodeAttempts: number;
  trustedEmailVerificationHours: number;
};

export type SecurityStatus = {
  authenticated: boolean;
  email: string | null;
  emailCodeRequired: boolean;
  emailCodeVerified: boolean;
  totpRequired: boolean;
  totpEnrolled: boolean;
  totpVerified: boolean;
  currentLevel: "aal1" | "aal2" | null;
  nextLevel: "aal1" | "aal2" | null;
  complete: boolean;
};
