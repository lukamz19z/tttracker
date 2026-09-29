import { Settings2 } from "lucide-react";

import ProjectIdentifierSettings from "./project-identifier-settings";
import {
  Page,
  PageHeader,
} from "@/components/ui/tt-ui";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getProjectNumberConfig } from "@/lib/projects/numbering";

type Props = {
  searchParams: Promise<{
    organisation?: string;
  }>;
};

export default async function SettingsPage({
  searchParams,
}: Props) {
  const query = await searchParams;

  const context =
    await requireWorkspaceContext(
      query.organisation ?? null,
    );

  const config =
    await getProjectNumberConfig(
      createSupabaseAdmin(),
      context.organisation.organisationId,
    );

  return (
    <Page>
      <PageHeader
        eyebrow={<Settings2 size={14} />}
        title="Organisation settings"
        subtitle="Configure organisation-wide behaviour without changing application code."
      />

      <ProjectIdentifierSettings
        organisationId={
          context.organisation.organisationId
        }
        initial={config}
      />
    </Page>
  );
}
