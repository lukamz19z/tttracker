import Link from "next/link";
import {
  ArrowRight,
  FolderKanban,
  Plus,
  RadioTower,
} from "lucide-react";

import {
  ButtonLink,
  EmptyState,
  Page,
  PageHeader,
  StatusBadge,
  tt,
} from "@/components/ui/tt-ui";
import { requireWorkspaceContext } from "@/lib/workspace/context";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

type Props = {
  searchParams: Promise<{
    organisation?: string;
  }>;
};

export default async function ProjectsPage({
  searchParams,
}: Props) {
  const query = await searchParams;

  const context =
    await requireWorkspaceContext(
      query.organisation ?? null,
    );

  const admin = createSupabaseAdmin();

  const { data: projects, error } =
    await admin
      .from("v2_projects")
      .select(`
        id,
        name,
        project_number,
        code,
        client_name,
        location,
        status,
        expected_tower_count
      `)
      .eq(
        "organisation_id",
        context.organisation.organisationId,
      )
      .neq("status", "archived")
      .order("name");

  if (error) {
    throw new Error(error.message);
  }

  const projectIds =
    (projects ?? []).map(
      (project) => project.id,
    );

  const { data: towerRows } =
    projectIds.length > 0
      ? await admin
          .from("v2_towers")
          .select("project_id")
          .in("project_id", projectIds)
      : { data: [] };

  const towerCountByProject =
    new Map<string, number>();

  for (const tower of towerRows ?? []) {
    towerCountByProject.set(
      tower.project_id,
      (towerCountByProject.get(
        tower.project_id,
      ) ?? 0) + 1,
    );
  }

  const totalTowers = Array.from(
    towerCountByProject.values(),
  ).reduce(
    (sum, value) => sum + value,
    0,
  );

  const orgId =
    context.organisation.organisationId;

  return (
    <Page>
      <PageHeader
        eyebrow={<FolderKanban size={14} />}
        title="Projects"
        subtitle="Manage projects, tower registers and project performance."
        actions={
          <ButtonLink
            href={`/workspace/projects/new?organisation=${encodeURIComponent(
              orgId,
            )}`}
            primary
          >
            <Plus size={16} />
            Create project
          </ButtonLink>
        }
      />

      <div
        className={tt.metricGrid}
        style={{ marginBottom: 20 }}
      >
        <div className={tt.metricCard}>
          <div className={tt.metricLabel}>
            Active projects
          </div>
          <div className={tt.metricValue}>
            {(projects ?? []).length}
          </div>
        </div>

        <div className={tt.metricCard}>
          <div className={tt.metricLabel}>
            Towers
          </div>
          <div className={tt.metricValue}>
            {totalTowers}
          </div>
        </div>
      </div>

      {(projects ?? []).length > 0 ? (
        <div className={tt.projectGrid}>
          {(projects ?? []).map(
            (project) => {
              const towerCount =
                towerCountByProject.get(
                  project.id,
                ) ?? 0;

              const expected =
                project.expected_tower_count;

              const details = [
                project.client_name,
                project.location,
              ].filter(Boolean);

              return (
                <Link
                  key={project.id}
                  href={`/workspace/projects/${project.id}?organisation=${encodeURIComponent(
                    orgId,
                  )}`}
                  className={tt.projectCard}
                >
                  <div className={tt.projectCardTop}>
                    <div className={tt.projectIcon}>
                      <FolderKanban size={19} />
                    </div>

                    <StatusBadge
                      status={project.status}
                    />
                  </div>

                  <div className={tt.projectNumber}>
                    {project.project_number ||
                      project.code}
                  </div>

                  <h2 className={tt.projectName}>
                    {project.name}
                  </h2>

                  <div className={tt.projectDetails}>
                    {details.length > 0
                      ? details.join(" · ")
                      : "Project details can be completed from project settings."}
                  </div>

                  <div className={tt.projectFooter}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <RadioTower size={15} />
                      {towerCount}{" "}
                      {towerCount === 1
                        ? "Tower"
                        : "Towers"}
                      {expected
                        ? ` · ${expected} expected`
                        : ""}
                    </span>

                    <ArrowRight size={15} />
                  </div>
                </Link>
              );
            },
          )}
        </div>
      ) : (
        <EmptyState title="No projects yet">
          Create the project first, then import its tower schedule.
        </EmptyState>
      )}
    </Page>
  );
}
