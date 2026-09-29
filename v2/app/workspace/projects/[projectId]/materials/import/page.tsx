import { Upload } from "lucide-react";

import MaterialsImportClient from "./materials-import-client";
import { Page, PageHeader } from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ organisation?: string }>;
};

export default async function MaterialsImportPage({
  params,
  searchParams,
}: Props) {
  const { projectId } = await params;
  const query = await searchParams;

  const context = await requireProjectContext(
    projectId,
    query.organisation ?? null,
  );

  return (
    <Page>
      <PageHeader
        eyebrow={<Upload size={14} />}
        title="Bulk import materials"
        subtitle="Load project materials in bulk, map the source columns and associate rows with towers where applicable."
      />

      <MaterialsImportClient
        organisationId={
          context.workspace.organisation.organisationId
        }
        projectId={projectId}
      />
    </Page>
  );
}
