import { Settings2 } from "lucide-react";

import ConfigurationClient from "./configuration-client";
import { Page, PageHeader } from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";
import {
  getProjectOptions,
  getProjectProgressConfiguration,
} from "@/lib/projects/operations";
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
  );

  const admin = createSupabaseAdmin();

  const [progress, options, { data: reviewSettings }] = await Promise.all([
    getProjectProgressConfiguration(projectId),
    getProjectOptions(projectId),
    admin
      .from("v2_project_docket_review_settings")
      .select(`
        internal_review_required,
        client_approval_enabled,
        client_approval_required,
        client_can_view_raw_mh,
        client_can_view_production_mh
      `)
      .eq("project_id", projectId)
      .maybeSingle(),
  ]);

  return (
    <Page>
      <PageHeader
        eyebrow={<Settings2 size={14} />}
        title="Project configuration"
        subtitle="Configure progress tracking, MH/t basis and Daily Docket dropdowns for this project."
      />

      <ConfigurationClient
        projectId={projectId}
        organisationId={
          context.workspace.organisation.organisationId
        }
        progress={progress}
        options={options}
        reviewSettings={{
          internalReviewRequired:
            reviewSettings?.internal_review_required ?? true,
          clientApprovalEnabled:
            reviewSettings?.client_approval_enabled ?? false,
          clientApprovalRequired:
            reviewSettings?.client_approval_required ?? false,
          clientCanViewRawMh:
            reviewSettings?.client_can_view_raw_mh ?? true,
          clientCanViewProductionMh:
            reviewSettings?.client_can_view_production_mh ?? true,
        }}
      />
    </Page>
  );
}
