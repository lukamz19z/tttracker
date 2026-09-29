import "server-only";

import { notFound, redirect } from "next/navigation";

import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServer } from "@/lib/supabase/server";
import { requireWorkspaceContext } from "@/lib/workspace/context";

async function resolveProjectOrganisationId(
  projectId: string,
  requestedOrganisationId?: string | null,
) {
  if (requestedOrganisationId) {
    return requestedOrganisationId;
  }

  const session =
    await createSupabaseServer();

  const { data: claimsData, error } =
    await session.auth.getClaims();

  const userId =
    typeof claimsData?.claims?.sub ===
    "string"
      ? claimsData.claims.sub
      : null;

  if (error || !userId) {
    redirect("/login");
  }

  const admin = createSupabaseAdmin();

  const { data: project } = await admin
    .from("v2_projects")
    .select("organisation_id")
    .eq("id", projectId)
    .maybeSingle();

  if (!project?.organisation_id) {
    notFound();
  }

  const { data: membership } =
    await admin
      .from("organisation_users")
      .select("organisation_id")
      .eq(
        "organisation_id",
        project.organisation_id,
      )
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

  if (!membership) {
    notFound();
  }

  return project.organisation_id;
}

export async function requireProjectContext(
  projectId: string,
  organisationId?: string | null,
) {
  const resolvedOrganisationId =
    await resolveProjectOrganisationId(
      projectId,
      organisationId,
    );

  const workspace =
    await requireWorkspaceContext(
      resolvedOrganisationId,
    );

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
        workspace.organisation
          .organisationId,
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
    project,
    sections,
  };
}
