import "server-only";

import { createSupabaseServer } from "@/lib/supabase/server";
import { isRecord } from "@/lib/materials/import-validation";

export class ProjectAccessError extends Error {
  constructor(message = "PROJECT_ACCESS_DENIED", public readonly status = 403) { super(message); }
}
export type ProjectAccess = {
  kind: "host" | "party";
  projectId: string;
  dataOrganisationId: string;
  hostOrganisationId: string;
  parties: Array<{ id: string; userId: string; organisationId: string | null; name: string; materialsEnabled: boolean; sharingMode: string; permissions: Record<string, boolean> }>;
  permissions: Record<string, boolean>;
  shares: Array<{ type: string; id: string; accessLevel: string; partyId: string }>;
  settingsView: boolean;
  settingsConfigure: boolean;
};

export async function resolveProjectAccess(projectId: string): Promise<ProjectAccess> {
  const session = await createSupabaseServer();
  const { data: claims, error: authError } = await session.auth.getClaims();
  if (authError || typeof claims?.claims?.sub !== "string") throw new ProjectAccessError("UNAUTHENTICATED", 401);
  const { data, error } = await session.rpc("tttracker_v2_project_access", { p_project_id: projectId });
  if (error) throw new Error(`PROJECT_ACCESS_LOOKUP_FAILED: ${error.message}`);
  if (!isRecord(data) || !["host", "party"].includes(String(data.kind))) throw new ProjectAccessError();
  // Database RPC is the authority; validate the boundary before consuming its JSON contract.
  if (data.projectId !== projectId || typeof data.dataOrganisationId !== "string" || typeof data.hostOrganisationId !== "string"
    || !isRecord(data.permissions) || !Array.isArray(data.parties) || !Array.isArray(data.shares)) throw new Error("INVALID_PROJECT_ACCESS_RESPONSE");
  return data as ProjectAccess;
}
