import { ClipboardPlus } from "lucide-react";

import DailyDocketEditor from "./daily-docket-editor";
import { Page, PageHeader } from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";
import {
  getProjectOptions,
  getProjectProgressConfiguration,
} from "@/lib/projects/operations";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    organisation?: string;
    tower?: string;
    date?: string;
  }>;
};

export default async function NewDailyDocketPage({
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

  const [
    { data: towers, error },
    options,
    progress,
  ] = await Promise.all([
    admin
      .from("v2_towers")
      .select("id, tower_identifier, tower_weight_t")
      .eq("project_id", projectId)
      .order("sequence_number", {
        ascending: true,
        nullsFirst: false,
      }),

    getProjectOptions(projectId),
    getProjectProgressConfiguration(projectId),
  ]);

  if (error) throw new Error(error.message);

  return (
    <Page>
      <PageHeader
        eyebrow={<ClipboardPlus size={14} />}
        title="New Daily Docket"
        subtitle="Record crew time, production deductions, delays, materials and progress. Raw MH/t and Production MH/t are shown together."
      />

      <DailyDocketEditor
        organisationId={
          context.workspace.organisation.organisationId
        }
        projectId={projectId}
        towers={towers ?? []}
        options={options}
        progressProfile={progress.profile}
        initialTowerId={query.tower ?? ""}
        initialDate={
          query.date ??
          new Date().toISOString().slice(0, 10)
        }
      />
    </Page>
  );
}
