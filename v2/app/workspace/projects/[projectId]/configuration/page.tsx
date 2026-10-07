import { Settings2 } from "lucide-react";

import ConfigurationClient from "./configuration-client";
import { Page, PageHeader } from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";
import { getProjectProgressConfiguration } from "@/lib/projects/operations";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ organisation?: string }>;
};

export default async function ProjectConfigurationPage({
  params,
  searchParams,
}: Props) {
  const { projectId } = await params;
  const query = await searchParams;

  const context = await requireProjectContext(
    projectId,
    query.organisation ?? null,
    "configuration",
  );

  const admin = createSupabaseAdmin();

  const [progress, { data: options, error: optionsError }, { data: reviewSettings }] = await Promise.all([
    context.access.settingsView ? getProjectProgressConfiguration(projectId) : Promise.resolve(null),
    admin
      .from("v2_project_option_definitions")
      .select("id,option_group,option_key,label,sort_order,is_active,settings")
      .eq("project_id", projectId)
      .order("option_group")
      .order("sort_order"),
    context.access.settingsView ? admin
      .from("v2_project_docket_review_settings")
      .select(`
        internal_review_required,
        client_approval_enabled,
        client_approval_required,
        client_can_view_raw_mh,
        client_can_view_production_mh
      `)
      .eq("project_id", projectId)
      .maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (optionsError) throw new Error(optionsError.message);

  return (
    <Page>
      <PageHeader
        eyebrow={<Settings2 size={14} />}
        title="Project configuration"
        subtitle="Choose a section, then configure only what this project needs."
      />

      <ConfigurationClient
        projectId={projectId}
        organisationId={context.workspace.organisation.organisationId}
        progress={progress}
        options={(options ?? []).filter((option) => context.access.settingsView || String(option.option_group).startsWith("material_"))}
        canConfigureMaterials={context.access.permissions["materials.configure"] === true}
        canConfigureProject={context.access.settingsConfigure}
        canViewProjectSettings={context.access.settingsView}
        reviewSettings={{
          internalReviewRequired: reviewSettings?.internal_review_required ?? true,
          clientApprovalEnabled: reviewSettings?.client_approval_enabled ?? false,
          clientApprovalRequired: reviewSettings?.client_approval_required ?? false,
          clientCanViewRawMh: reviewSettings?.client_can_view_raw_mh ?? true,
          clientCanViewProductionMh: reviewSettings?.client_can_view_production_mh ?? true,
        }}
      />
    </Page>
  );
}
