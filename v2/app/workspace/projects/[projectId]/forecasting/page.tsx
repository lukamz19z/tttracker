import { BarChart3 } from "lucide-react";

import ForecastingClient from "./forecasting-client";
import {
  Page,
  PageHeader,
} from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";
import { getForecastingData } from "@/lib/projects/forecasting";

type Props = {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{
    organisation?: string;
    start?: string;
    end?: string;
  }>;
};

export default async function ForecastingPage({
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

  const data =
    await getForecastingData(
      projectId,
      {
        startDate:
          query.start ?? null,
        endDate:
          query.end ?? null,
      },
    );

  return (
    <Page>
      <PageHeader
        eyebrow={<BarChart3 size={14} />}
        title="Forecasting & performance"
        subtitle={`Compare crews, tower types and timelines for ${context.project.name} using actual project production data.`}
      />


      <div style={{ marginTop: 18 }}>
        <ForecastingClient
          data={data}
          organisationId={
            context.workspace.organisation.organisationId
          }
          projectId={projectId}
          initialStartDate={
            query.start ?? ""
          }
          initialEndDate={
            query.end ?? ""
          }
        />
      </div>
    </Page>
  );
}
