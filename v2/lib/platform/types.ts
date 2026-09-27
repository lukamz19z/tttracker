export type PlatformAdminRole = "owner" | "admin" | "support";

export type SubscriptionPlanSummary = {
  planId: string;
  planKey: string;
  planName: string;
  planVersionId: string;
  version: number;
  description: string | null;
  entitlementCount: number;
};

export type OrganisationSummary = {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  abn: string | null;
  status: string;
  createdAt: string;
  userCount: number;
  projectCount: number;
  planKey: string | null;
  planName: string | null;
  planVersion: number | null;
  subscriptionStatus: string | null;
};

export type CreateOrganisationInput = {
  code: string;
  name: string;
  legalName?: string | null;
  abn?: string | null;
  initialAdminEmail: string;
  planVersionId: string;
};
