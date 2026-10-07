import "server-only";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isRecord } from "@/lib/materials/import-validation";
import type { ProjectAccess } from "@/lib/projects/access";
import { selectProjectParticipant } from "@/lib/projects/access-selection";

export type AccessibleProject = {
  id: string; name: string; code: string; project_number: string | null;
  client_name: string | null; location: string | null; expected_tower_count: number | null;
  status: string; organisationId: string; href: string; party: boolean; participantName?: string;
};
export async function listAccessibleProjects(organisationId?: string | null): Promise<AccessibleProject[]> {
  const session = await createSupabaseServer();
  const { data, error } = await session.rpc("tttracker_v2_accessible_projects");
  if (error) throw new Error(`PROJECT_LIST_ACCESS_LOOKUP_FAILED: ${error.message}`);
  if (!Array.isArray(data)) throw new Error("PROJECT_LIST_INVALID_RESPONSE");
  const projects: AccessibleProject[] = [];
  for (const row of data) {
    if (!isRecord(row) || !isRecord(row.project) || !isRecord(row.access)) throw new Error("PROJECT_LIST_INVALID_RESPONSE");
    const p = row.project;
    const a = row.access;
    if ((a.kind !== "host" && a.kind !== "party") || !Array.isArray(a.parties) || !Array.isArray(a.shares)
      || !isRecord(a.permissions) || typeof a.dataOrganisationId !== "string"
      || typeof p.id !== "string" || typeof p.name !== "string" || typeof p.code !== "string"
      || typeof p.status !== "string" || (p.project_number !== null && typeof p.project_number !== "string")) {
      throw new Error("PROJECT_LIST_INVALID_RESPONSE");
    }
    const raw = a as ProjectAccess;
    const candidates = raw.kind === "party"
      ? { ...raw, parties: raw.parties.filter((party) => party.permissions["materials.view"] || party.permissions["materials.configure"]) }
      : raw;
    const access = selectProjectParticipant(candidates, organisationId);
    if (!access) continue;
    const party = access.kind === "party";
    const participant = party ? access.parties[0] : null;
    const participantId = participant ? participant.organisationId ?? participant.id : access.dataOrganisationId;
    // Party users land only in a permitted section, never the internal project dashboard.
    const section = party ? access.permissions["materials.view"] ? "/materials"
      : access.permissions["materials.configure"] ? "/configuration" : null : "";
    if (section === null) continue;
    projects.push({ id: p.id, name: p.name, code: p.code, status: p.status,
      client_name: typeof p.client_name === "string" ? p.client_name : null,
      location: typeof p.location === "string" ? p.location : null,
      expected_tower_count: typeof p.expected_tower_count === "number" ? p.expected_tower_count : null,
      project_number: p.project_number, organisationId: participantId, party, participantName: participant?.name,
      href: `/workspace/projects/${p.id}${section}?organisation=${encodeURIComponent(participantId)}` });
  }
  return projects;
}
