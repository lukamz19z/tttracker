import { RadioTower } from "lucide-react";

import NewTowerClient from "./new-tower-client";
import {
  Page,
  PageHeader,
} from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{
    organisation?: string;
  }>;
};

export default async function NewTowerPage({
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

  const { data: types, error } =
    await createSupabaseAdmin()
      .from("v2_tower_types")
      .select("id, name, type_code")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("name");

  if (error) {
    throw new Error(error.message);
  }

  return (
    <Page>
      <PageHeader
        eyebrow={<RadioTower size={14} />}
        title="Add tower"
        subtitle="Use this for an individual tower. For a project tower schedule, use Import Towers."
      />

      <NewTowerClient
        organisationId={
          context.workspace.organisation.organisationId
        }
        projectId={projectId}
        towerTypes={(types ?? []).map(
          (type) => ({
            id: type.id,
            name: type.name,
            typeCode: type.type_code,
          }),
        )}
      />
    </Page>
  );
}
