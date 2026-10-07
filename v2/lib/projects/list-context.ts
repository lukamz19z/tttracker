import "server-only";
import { cookies } from "next/headers";
import {
  requireWorkspaceContext,
  requirePartyWorkspaceContext,
} from "@/lib/workspace/context";
import { listAccessibleProjects } from "@/lib/projects/list";
import { resolveProjectAccess } from "@/lib/projects/access";
import { selectProjectParticipant } from "@/lib/projects/access-selection";
export async function requireProjectListContext(
  organisationId?: string | null,
  purpose: "workspace" | "personal" = "workspace",
) {
  const explicitOrganisation = organisationId;
  organisationId ??= (await cookies()).get("tttracker-workspace")?.value;
  try {
    return await requireWorkspaceContext(organisationId,purpose);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      ![
        "NO_ACTIVE_ORGANISATION_MEMBERSHIP",
        "WORKSPACE_ORGANISATION_ACCESS_DENIED",
      ].includes(error.message)
    )
      throw error;
    const projects = await listAccessibleProjects(organisationId);
    const project = projects.find((item) => item.party);
    if (!project) {
      if (!explicitOrganisation && organisationId)
        return requireProjectListContextWithoutPreference(purpose);
      throw error;
    }
    const access = selectProjectParticipant(
      await resolveProjectAccess(project.id),
      project.organisationId,
    );
    const party = access?.parties[0];
    if (!access || !party) throw error;
    return requirePartyWorkspaceContext(access, party);
  }
}

async function requireProjectListContextWithoutPreference(purpose: "workspace" | "personal") {
  try {
    return await requireWorkspaceContext(undefined,purpose);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      error.message !== "NO_ACTIVE_ORGANISATION_MEMBERSHIP"
    )
      throw error;
    const project = (await listAccessibleProjects()).find((p) => p.party);
    if (!project) throw error;
    const access = selectProjectParticipant(
      await resolveProjectAccess(project.id),
      project.organisationId,
    );
    const party = access?.parties[0];
    if (!access || !party) throw error;
    return requirePartyWorkspaceContext(access, party);
  }
}
