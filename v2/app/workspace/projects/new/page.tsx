import { FolderPlus } from "lucide-react";

import ProjectForm from "./project-form";
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

export default async function NewProjectPage({
  searchParams,
}: Props) {
  const query = await searchParams;

  const context =
    await requireWorkspaceContext(
      query.organisation ?? null,
    );

  const numberConfig =
    await getProjectNumberConfig(
      createSupabaseAdmin(),
      context.organisation.organisationId,
    );

  return (
    <Page>
      <PageHeader
        eyebrow={<FolderPlus size={14} />}
        title="Create project"
        subtitle="Set the key project information now. Towers and operational configuration can be added immediately after creation."
      />

      <ProjectForm
        organisationId={
          context.organisation.organisationId
        }
        numberConfig={numberConfig}
      />
    </Page>
  );
}
