import {
  AlertTriangle,
  ClipboardList,
  Clock3,
  RadioTower,
} from "lucide-react";

import {
  Card,
  MetricCard,
  Page,
  PageHeader,
  ProgressBar,
  tt,
} from "@/components/ui/tt-ui";
import { requireProjectContext } from "@/lib/projects/project-context";
import { getProjectDashboardData } from "@/lib/projects/dashboard";

type Props = {
  params: Promise<{
    projectId: string;
  }>;
  searchParams: Promise<{
    organisation?: string;
  }>;
};

function fmt(
  value: number | null,
  digits = 1,
) {
  return value === null ||
    Number.isNaN(value)
    ? "-"
    : value.toFixed(digits);
}

export default async function ProjectPage({
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

  const stats =
    await getProjectDashboardData(
      projectId,
    );

  const projectMeta = [
    context.project.client_name,
    context.project.location,
    context.project.project_year
      ? String(context.project.project_year)
      : null,
  ].filter(Boolean);

  return (
    <Page className={tt.stack}>
      <PageHeader
        eyebrow={
          context.project.project_number ??
          context.project.code
        }
        title={context.project.name}
        subtitle={
          projectMeta.length > 0
            ? projectMeta.join(" · ")
            : "Project overview"
        }
      />

      <div className={tt.metricGrid}>
        <MetricCard
          icon={<RadioTower size={18} />}
          label="Towers"
          value={stats.towerCount}
          detail={`${stats.completeCount} complete · ${stats.inProgressCount} in progress · ${stats.notStartedCount} not started`}
        />

        <MetricCard
          icon={<Clock3 size={18} />}
          label="Raw MH/t"
          value={fmt(
            stats.rawMhPerTonne,
            2,
          )}
          detail={`${fmt(
            stats.rawHours,
            1,
          )} raw hours`}
        />

        <MetricCard
          icon={<Clock3 size={18} />}
          label="Production MH/t"
          value={fmt(
            stats.productionMhPerTonne,
            2,
          )}
          detail={`${fmt(
            stats.productionHours,
            1,
          )} production hours`}
        />

        <MetricCard
          icon={<ClipboardList size={18} />}
          label="Production records"
          value={stats.totalDockets}
          detail={
            stats.latestDocketDate
              ? `Latest ${stats.latestDocketDate}`
              : "No production data yet"
          }
        />
      </div>

      <section>
        <h2 className={tt.sectionTitle}>
          Progress
        </h2>
        <p className={tt.sectionSub}>
          Assembly and erection progress across the project.
        </p>

        <div
          className={tt.threeCol}
          style={{ marginTop: 14 }}
        >
          <ProgressBar
            label="Assembly"
            value={stats.assemblyAverage}
          />
          <ProgressBar
            label="Erection"
            value={stats.erectionAverage}
          />
          <ProgressBar
            label="Overall"
            value={stats.overallProgress}
          />
        </div>
      </section>

      <Card>
        <h2 className={tt.cardTitle}>
          Project status
        </h2>
        <p className={tt.cardDescription}>
          Current operational indicators requiring attention.
        </p>

        <div
          className={tt.summaryList}
          style={{ marginTop: 12 }}
        >
          <Summary
            icon={<AlertTriangle size={15} />}
            label="Open defects"
            value={String(
              stats.openDefects,
            )}
          />

          <Summary
            label="Total defects"
            value={String(
              stats.totalDefects,
            )}
          />

          <Summary
            label="Total tower weight"
            value={
              stats.totalWeight > 0
                ? `${fmt(
                    stats.totalWeight,
                    1,
                  )} t`
                : "Not available"
            }
          />

          <Summary
            label="Latest production date"
            value={
              stats.latestDocketDate ??
              "No data yet"
            }
          />
        </div>
      </Card>

      {stats.towerCount === 0 ? (
        <div
          className={`${tt.notice} ${tt.noticeInfo}`}
        >
          This project does not have a tower register yet. Open <strong>Towers</strong> from the project sidebar to import the project tower schedule.
        </div>
      ) : null}
    </Page>
  );
}

function Summary({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={tt.summaryRow}>
      <span
        className={tt.summaryLabel}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        {icon}
        {label}
      </span>

      <span className={tt.summaryValue}>
        {value}
      </span>
    </div>
  );
}
