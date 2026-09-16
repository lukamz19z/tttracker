export type MaterialPayload = {
  projectId: string;
  generatedAt: string;
  towers: Array<Record<string, unknown>>;
  bundles: Array<Record<string, unknown>>;
  members: Array<Record<string, unknown>>;
  bolts: Array<Record<string, unknown>>;
  bundleChecks: Array<Record<string, unknown>>;
  memberChecks: Array<Record<string, unknown>>;
  deliveries: Array<Record<string, unknown>>;
  materialEvents: Array<Record<string, unknown>>;
  transfers: Array<Record<string, unknown>>;
};
