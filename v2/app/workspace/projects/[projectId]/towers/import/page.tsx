import { Upload } from "lucide-react";

import ImportClient from "./import-client";
import {
  Page,
  PageHeader,
} from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";

type Props = {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{
    organisation?: string;
  }>;
};

export default async function TowerImportPage({
  params,
  searchParams,
}: Props) {
  const { projectId } = await params;
  const query = await searchParams;

  const context =
    await requireProjectContext(
      projectId,
      query.organisation ?? null,
    );

  return (
    <Page>
      <PageHeader
        eyebrow={<Upload size={14} />}
        title="Import towers"
        subtitle={`Upload the tower schedule for ${context.project.name}, check the mapping, preview the data and then create the tower register.`}
      />

      <ImportClient
        organisationId={
          context.workspace.organisation.organisationId
        }
        projectId={projectId}
      />
    </Page>
  );
}
