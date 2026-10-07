import "server-only";

import { notFound } from "next/navigation";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireWorkspaceContext, requirePartyWorkspaceContext } from "@/lib/workspace/context";
import { selectProjectParticipant } from "@/lib/projects/access-selection";
import { resolveProjectAccess, ProjectAccessError } from "@/lib/projects/access";

export async function requireProjectContext(
  projectId: string,
  organisationId?: string | null,
  scope: "internal" | "shell" | "materials" | "configuration" = "internal",
) {
  const access = selectProjectParticipant(await resolveProjectAccess(projectId), organisationId);
  if (!access) throw new ProjectAccessError();
  if (access.kind === "party" && scope === "internal") throw new ProjectAccessError();
  if (scope === "materials" && !access.permissions["materials.view"]) throw new ProjectAccessError("MATERIALS_PERMISSION_DENIED");
  if (scope === "configuration" && !access.settingsView && !access.permissions["materials.configure"]) throw new ProjectAccessError("CONFIGURATION_PERMISSION_DENIED");
  // Workspace identity is the participant; data ownership remains the canonical project organisation.
  const participant = access.kind === "party" ? access.parties.find((party) =>
    !organisationId || party.organisationId === organisationId || party.id === organisationId) : null;
  if (access.kind === "party" && !participant) throw new ProjectAccessError();
  if (access.kind === "host" && organisationId && organisationId !== access.dataOrganisationId) throw new ProjectAccessError();
  let workspace: Awaited<ReturnType<typeof requireWorkspaceContext>>;
  if (access.kind === "host") workspace = await requireWorkspaceContext(access.dataOrganisationId);
  else {
    if (!participant) throw new ProjectAccessError();
    workspace = await requirePartyWorkspaceContext(access, participant);
  }

  const admin = createSupabaseAdmin();

  const { data: project, error } =
    await admin
      .from("v2_projects")
      .select(`
        id,
        organisation_id,
        name,
        code,
        project_number,
        description,
        status,
        start_date,
        end_date,
        client_name,
        client_code,
        location,
        expected_tower_count,
        project_year,
        project_type,
        forecast_settings
      `)
      .eq("id", projectId)
      .eq(
        "organisation_id",
        access.dataOrganisationId,
      )
      .maybeSingle();

  if (error || !project) {
    notFound();
  }

  const [
    { data: definitions },
    { data: overrides },
  ] = await Promise.all([
    admin
      .from("v2_section_definitions")
      .select(`
        section_key,
        label,
        route_segment,
        module_key,
        sort_order,
        implementation_status,
        default_enabled
      `)
      .eq("scope", "project")
      .neq(
        "implementation_status",
        "disabled",
      )
      .order("sort_order"),

    admin
      .from("v2_project_section_settings")
      .select(`
        section_key,
        enabled,
        label_override,
        sort_order_override
      `)
      .eq("project_id", project.id),
  ]);

  type SectionOverride = {
    section_key: string;
    enabled: boolean;
    label_override: string | null;
    sort_order_override: number | null;
  };

  const overrideMap = new Map<string, SectionOverride>(
    ((overrides ?? []) as SectionOverride[]).map((row) => [
      row.section_key,
      row,
    ]),
  );

  const sections =
    (definitions ?? [])
      .filter((definition) => {
        if (access.kind === "party" && definition.section_key !== "project_materials" && definition.section_key !== "project_configuration") return false;
        if (definition.section_key === "project_materials" && !access.permissions["materials.view"]) return false;
        if (definition.section_key === "project_configuration" && !access.settingsView && !access.permissions["materials.configure"]) return false;
        const override =
          overrideMap.get(
            definition.section_key,
          );

        const enabled =
          override?.enabled ??
          definition.default_enabled;

        const moduleAllowed =
          !definition.module_key ||
          workspace.enabledModules.has(
            definition.module_key,
          );

        return (
          enabled &&
          moduleAllowed &&
          definition.implementation_status ===
            "ready"
        );
      })
      .map((definition) => {
        const override =
          overrideMap.get(
            definition.section_key,
          );

        return {
          key:
            definition.section_key,
          label:
            override?.label_override ??
            definition.label,
          routeSegment:
            definition.route_segment ??
            "",
          sortOrder:
            override?.sort_order_override ??
            definition.sort_order,
        };
      })
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder,
      );

  return {
    workspace,
    access,
    dataOrganisationId: access.dataOrganisationId,
    project,
    sections,
  };
}
