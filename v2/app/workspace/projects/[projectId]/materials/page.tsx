import { Boxes, Upload } from "lucide-react";

import { ButtonLink, Page, PageHeader } from "@/components/ui/tt-ui";
import { materialsPageContext } from "@/lib/materials/page-access";
import MaterialsAccessDenied from "@/components/materials/access-denied";
import { getMaterialsControl } from "@/lib/materials/server";

import MaterialsControlClient from "./materials-control-client";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ organisation?: string }>;
};

export default async function MaterialsControlPage({ params, searchParams }: Props) {
  const { projectId } = await params;
  const query = await searchParams;
  const context = await materialsPageContext(projectId, query.organisation ?? null);
  if (!context) return <MaterialsAccessDenied />;
  const organisationId = context.workspace.organisation.organisationId;
  const initial = await getMaterialsControl(context);

  return (
    <Page>
      <PageHeader
        eyebrow={<Boxes size={14} />}
        title="Materials Control"
        subtitle="Project-wide bundle check-off, member-to-pack lookup, bolts and packers, missing / excess traceability, movements, reservations, redlines and source reconciliation."
        actions={
          initial.permissions.import ? <ButtonLink href={`/workspace/projects/${projectId}/materials/import?organisation=${encodeURIComponent(organisationId)}`} primary>
            <Upload size={14} /> Import Materials
          </ButtonLink> : null
        }
      />
      <MaterialsControlClient initial={initial} />
    </Page>
  );
}
