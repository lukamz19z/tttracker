export type WorkspaceMembership = {
  organisationId: string;
  organisationCode: string;
  organisationName: string;
};

export type WorkspaceSection = {
  key: string;
  label: string;
  routeSegment: string;
  moduleKey: string | null;
  sortOrder: number;
  implementationStatus: "ready" | "planned" | "disabled";
};

export type WorkspaceContext = {
  contextKind?: "organisation" | "client";
  platformAdmin?: boolean;
  permissions?: Record<string, boolean>;
  projectOnly?: boolean;
  userId: string;
  email: string;
  organisation: WorkspaceMembership;
  memberships: WorkspaceMembership[];
  enabledModules: Set<string>;
  sections: WorkspaceSection[];
};
